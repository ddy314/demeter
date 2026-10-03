"""Deterministic showcase studies. Not a crop-growth or pesticide-deposition model."""

import math
from itertools import pairwise

import networkx as nx
from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

from .geometry import elevation, exclusion_polygon, make_geometry, plot_polygon
from .models import Scene


class StudyInputs(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(default=30.6, ge=-60, le=60)
    day: int = Field(default=172, ge=1, le=365)
    greenhouses: int = Field(default=0, ge=0, le=4)
    transmission: float = Field(default=0.72, ge=0.3, le=1)
    greenhouse_cost_m2: float = Field(default=150, ge=1, le=1500)
    yield_kg_tree: float = Field(default=35, ge=1, le=200)
    price_kg: float = Field(default=8, ge=0.1, le=100)
    operating_cost_tree: float = Field(default=110, ge=0, le=2000)
    protected_yield_factor: float = Field(default=1.2, ge=0.5, le=2)
    swath_m: float = Field(default=5, ge=2, le=10)
    drone_speed_ms: float = Field(default=3, ge=1, le=8)
    drone_service_mu: float = Field(default=18, ge=1, le=200)
    annual_operations: int = Field(default=6, ge=1, le=30)


class StudyRequest(BaseModel):
    scene: Scene
    inputs: StudyInputs = Field(default_factory=StudyInputs)


def sun_vector(latitude, day, solar_hour):
    """NOAA declination approximation, local solar time; x east, y north, z up."""
    g = 2 * math.pi / 365 * (day - 1)
    dec = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.00148 * math.sin(3 * g)
    )
    lat, h = math.radians(latitude), math.radians(15 * (solar_hour - 12))
    return [
        -math.cos(dec) * math.sin(h),
        math.cos(lat) * math.sin(dec) - math.sin(lat) * math.cos(dec) * math.cos(h),
        math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(h),
    ]


def greenhouse_sites(scene, inputs):
    free = plot_polygon(scene).buffer(-2).difference(exclusion_polygon(scene).buffer(2))
    sites = []
    width, depth = 20, 9
    # Platforms between terrace risers, with buildings entirely inside usable land.
    for row in range(scene.terraces):
        cy = (row + 0.38) * scene.depth / scene.terraces
        for cx in [scene.width * 0.35, scene.width * 0.65]:
            shape = box(cx - width / 2, cy - depth / 2, cx + width / 2, cy + depth / 2)
            corners = list(shape.exterior.coords)
            zs = [elevation(scene, x, y) for x, y in corners]
            if (
                not free.covers(shape)
                or max(zs) - min(zs) > 0.8
                or any(shape.distance(box(*s["bounds"])) < 3 for s in sites)
            ):
                continue
            sites.append(
                {
                    "id": f"G{len(sites) + 1:02}",
                    "x": cx,
                    "y": cy,
                    "z": max(zs),
                    "width": width,
                    "depth": depth,
                    "area_m2": shape.area,
                    "bounds": list(shape.bounds),
                }
            )
            if len(sites) == inputs.greenhouses:
                return sites
    return sites[: inputs.greenhouses]


def light_study(scene, nodes, sites, inputs):
    polygon = plot_polygon(scene)
    samples = []
    for k in range(48):
        hour = (k + 0.5) / 2
        v = sun_vector(inputs.latitude, inputs.day, hour)
        if v[2] > 0:
            samples.append((hour, v))
    values = {}
    for n in nodes:
        visible = 0
        for _, v in samples:
            horizontal = math.hypot(v[0], v[1])
            blocked = False
            if horizontal > 1e-6:
                for step in range(
                    1, math.ceil(math.hypot(scene.width, scene.depth) / 2) + 1
                ):
                    distance = step * 2
                    x, y = (
                        n["x"] + distance * v[0] / horizontal,
                        n["y"] + distance * v[1] / horizontal,
                    )
                    if not polygon.covers(Point(x, y)):
                        break
                    ray_z = n["z"] + 1.5 + distance * v[2] / horizontal
                    if elevation(scene, x, y) > ray_z:
                        blocked = True
                        break
            if not blocked:
                visible += 0.5
        protected = any(box(*s["bounds"]).covers(Point(n["x"], n["y"])) for s in sites)
        values[n["id"]] = {
            "direct_hours": visible,
            "effective_hours": round(
                visible * (inputs.transmission if protected else 1), 2
            ),
            "protected": protected,
        }
    worst = min(nodes, key=lambda n: values[n["id"]]["effective_hours"])
    best = max(nodes, key=lambda n: values[n["id"]]["effective_hours"])
    return {
        "nodes": values,
        "mean_hours": round(
            sum(v["direct_hours"] for v in values.values()) / len(nodes), 2
        ),
        "daylight_hours": len(samples) * 0.5,
        "weakest": worst["id"],
        "best": best["id"],
        "sun_samples": [{"hour": h, "vector": v} for h, v in samples],
    }


def drone_study(scene, sites, inputs):
    target = (
        plot_polygon(scene)
        .buffer(-2)
        .difference(exclusion_polygon(scene).buffer(3, join_style=2))
    )
    if sites:
        target = target.difference(
            unary_union([box(*s["bounds"]).buffer(3, join_style=2) for s in sites])
        )
    if target.is_empty:
        return {
            "segments": [],
            "distance_m": 0,
            "duration_min": 0,
            "coverage_pct": 0,
            "target_area_m2": 0,
            "covered_area_m2": 0,
            "altitude_m": scene.rise + 12,
        }
    # Fly the largest connected component; report uncovered components explicitly.
    components = list(target.geoms) if target.geom_type == "MultiPolygon" else [target]
    free = max(components, key=lambda p: p.area)
    vertices = list(free.exterior.coords)[:-1]
    for ring in free.interiors:
        vertices.extend(list(ring.coords)[:-1])
    graph = nx.Graph()
    for i, p in enumerate(vertices):
        graph.add_node(i, point=p)
        for j, q in enumerate(vertices[:i]):
            if free.buffer(1e-7).covers(LineString([p, q])):
                graph.add_edge(i, j, weight=math.dist(p, q))

    def transit(a, b):
        if free.buffer(1e-7).covers(LineString([a, b])):
            return [a, b]
        g = graph.copy()
        for key, p in [("a", a), ("b", b)]:
            g.add_node(key, point=p)
            for i, q in enumerate(vertices):
                if free.buffer(1e-7).covers(LineString([p, q])):
                    g.add_edge(key, i, weight=math.dist(p, q))
        try:
            return [
                g.nodes[i]["point"]
                for i in nx.shortest_path(g, "a", "b", weight="weight")
            ]
        except nx.NetworkXNoPath:
            return None

    segments, passes = [], []
    altitude = scene.rise + 12
    minx, miny, maxx, maxy = free.bounds
    last = None
    for row in range(math.ceil((maxy - miny) / inputs.swath_m)):
        y = miny + (row + 0.5) * inputs.swath_m
        cut = free.intersection(LineString([(minx - 1, y), (maxx + 1, y)]))
        lines = list(cut.geoms) if cut.geom_type == "MultiLineString" else [cut]
        lines = sorted(
            [l for l in lines if l.geom_type == "LineString" and l.length > 0.1],
            key=lambda l: l.bounds[0],
            reverse=bool(row % 2),
        )
        for line in lines:
            ends = list(line.coords)
            ends = sorted(ends, reverse=bool(row % 2))
            if last is not None:
                path = transit(last, ends[0])
                if path is None:
                    continue
                for a, b in pairwise(path):
                    if math.dist(a, b) > 0.001:
                        segments.append(
                            {"a": [*a, altitude], "b": [*b, altitude], "spray": False}
                        )
            segments.append(
                {"a": [*ends[0], altitude], "b": [*ends[-1], altitude], "spray": True}
            )
            passes.append(line.buffer(inputs.swath_m / 2, cap_style=2))
            last = ends[-1]
    length = sum(math.dist(s["a"], s["b"]) for s in segments)
    covered = unary_union(passes).intersection(target).area if passes else 0
    return {
        "segments": segments,
        "distance_m": round(length, 2),
        "duration_min": round(length / inputs.drone_speed_ms / 60, 2),
        "coverage_pct": round(100 * covered / target.area, 1),
        "covered_area_m2": round(covered, 2),
        "target_area_m2": round(target.area, 2),
        "altitude_m": altitude,
    }


def study(request: StudyRequest):
    scene, inputs = request.scene, request.inputs
    geom, _, _ = make_geometry(scene)
    sites = greenhouse_sites(scene, inputs) if inputs.greenhouses else []
    light = light_study(scene, geom["nodes"], sites, inputs)
    drone = drone_study(scene, sites, inputs)
    protected = sum(v["protected"] for v in light["nodes"].values())
    yield_kg = inputs.yield_kg_tree * (
        len(geom["nodes"]) - protected + protected * inputs.protected_yield_factor
    )
    greenhouse_capex = sum(s["area_m2"] for s in sites) * inputs.greenhouse_cost_m2
    annual_drone = (
        drone["target_area_m2"]
        / (2000 / 3)
        * inputs.drone_service_mu
        * inputs.annual_operations
    )
    return {
        "revision": scene.revision(),
        "inputs": inputs.model_dump(),
        "greenhouses": sites,
        "unplaced_greenhouses": inputs.greenhouses - len(sites),
        "light": light,
        "drone": drone,
        "economics": {
            "yield_kg": round(yield_kg, 2),
            "revenue": round(yield_kg * inputs.price_kg, 2),
            "operating_cost": round(
                len(geom["nodes"]) * inputs.operating_cost_tree + annual_drone, 2
            ),
            "greenhouse_capex": greenhouse_capex,
            "annual_drone": round(annual_drone, 2),
            "protected_trees": protected,
            "maintenance_rate": 0.04,
        },
        "assumptions": [
            "Solar time and true north; half-hour samples with 2 m terrain-ray steps. Excludes clouds and neighboring canopy shade.",
            "Roof transmission and protected yield factors are independent inputs. Yield is not inferred from sunlight.",
            "Annual cash flow for a mature orchard; excludes land, taxes, financing, depreciation and residual value.",
            "Drone visualization uses a fixed elevation 12 m above the highest ground, with spraying disabled during transit. Excludes wind and deposition.",
            "Flight time is path length divided by speed; excludes takeoff, landing, turns and servicing. No executable mission is produced.",
        ],
    }
