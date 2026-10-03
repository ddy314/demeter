import math
from itertools import pairwise

import networkx as nx
import numpy as np
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .models import Scene


def elevation(scene: Scene, x: float, y: float) -> float:
    """Piecewise terraces with short sloped risers; never a visual-only exaggeration."""
    level = min(scene.terraces - 1, max(0, y / scene.depth * scene.terraces))
    base = math.floor(level)
    f = level - base
    ramp = max(0, (f - 0.76) / 0.24)
    return scene.rise / (scene.terraces - 1) * (base + ramp)


def plot_polygon(scene):
    return Polygon([(x * scene.width, y * scene.depth) for x, y in scene.boundary])


def exclusion_polygon(scene):
    return unary_union(
        [
            Polygon([(x * scene.width, y * scene.depth) for x, y in p])
            for p in scene.exclusions
        ]
    )


def surface_path(scene, a, b):
    steps = max(2, math.ceil(math.dist(a, b) / 1.0))
    points = []
    for k in range(steps + 1):
        t = k / steps
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        points.append(
            [round(x, 4), round(y, 4), round(elevation(scene, x, y) + 1.5, 4)]
        )
    return points


def make_geometry(scene: Scene):
    polygon = plot_polygon(scene)
    excluded = exclusion_polygon(scene)
    grid = {}
    nodes = []
    # Exclusions are explicitly non-planting AND non-construction areas in this MVP.
    for r, y in enumerate(
        np.arange(scene.row_spacing / 2, scene.depth, scene.row_spacing)
    ):
        for c, x in enumerate(np.arange(scene.spacing / 2, scene.width, scene.spacing)):
            pt = Point(x, y)
            if polygon.buffer(-1).covers(pt) and not excluded.buffer(1).covers(pt):
                ident = f"T{len(nodes) + 1:03}"
                node = {
                    "id": ident,
                    "x": float(x),
                    "y": float(y),
                    "z": elevation(scene, x, y) + 1.5,
                    "row": r,
                    "col": c,
                    "terrace": min(
                        scene.terraces - 1, int(y / scene.depth * scene.terraces)
                    ),
                }
                grid[(r, c)] = ident
                nodes.append(node)
    if not nodes:
        raise ValueError(
            "No serviceable planting nodes; adjust the boundary, exclusions or spacing"
        )
    sx, sy = scene.source[0] * scene.width, scene.source[1] * scene.depth
    source = {
        "id": "S",
        "x": sx,
        "y": sy,
        "z": elevation(scene, sx, sy) + 1.5,
        "row": -1,
        "col": -1,
        "terrace": -1,
    }
    byid = {n["id"]: n for n in [source] + nodes}
    graph = nx.Graph()
    graph.add_nodes_from(byid)

    def add_edge(a, b):
        na, nb = byid[a], byid[b]
        xy1 = (na["x"], na["y"])
        xy2 = (nb["x"], nb["y"])
        line = LineString([xy1, xy2])
        if not polygon.buffer(1e-7).covers(line) or line.intersects(excluded):
            return
        pts = surface_path(scene, xy1, xy2)
        length = sum(math.dist(p, q) for p, q in pairwise(pts))
        graph.add_edge(
            a, b, length=length, points=pts, cross=abs(na["y"] - nb["y"]) > 0.1
        )

    for (r, c), a in grid.items():
        for offset in [(0, 1), (1, 0)]:
            b = grid.get((r + offset[0], c + offset[1]))
            if b:
                add_edge(a, b)
    for node in sorted(nodes, key=lambda n: math.hypot(n["x"] - sx, n["y"] - sy))[:8]:
        add_edge("S", node["id"])
    connected = nx.node_connected_component(graph, "S")
    unreachable = [n["id"] for n in nodes if n["id"] not in connected]
    # Constrain every triangle to a terrace/riser band. Global Delaunay can
    # bridge the break lines near an oblique boundary and float tree roots.
    breaks = sorted(
        {0.0, scene.depth}
        | {
            scene.depth / scene.terraces * (i + f)
            for i in range(scene.terraces)
            for f in (0, 0.76, 1)
        }
    )
    vertices = []
    for lower, upper in pairwise(breaks):
        band = polygon.intersection(box(-1, lower, scene.width + 1, upper))
        for triangle in constrained_delaunay_triangles(band).geoms:
            for x, y in list(triangle.exterior.coords)[:3]:
                vertices.extend(
                    [round(x, 6), round(y, 6), round(elevation(scene, x, y), 6)]
                )
    return (
        {
            "nodes": nodes,
            "source": source,
            "mesh": vertices,
            "area_m2": round(polygon.area, 1),
            "plantable_area_m2": round(polygon.difference(excluded).area, 1),
            "candidate_edges": len(graph.edges),
            "unreachable": unreachable,
        },
        graph,
        byid,
    )


def network_tree(scene, graph, byid, layout):
    """Two deterministic, construction-weighted shortest-path spanning trees."""

    def weight(a, b, data):
        mid = (byid[a]["x"] + byid[b]["x"]) / 2 / scene.width
        spine = scene.source[0] if layout == 0 else 0.55
        return data["length"] * (
            1 + (2.5 * abs(mid - spine) + 0.4 if data["cross"] else 0)
        )

    paths = nx.single_source_dijkstra_path(graph, "S", weight=weight)
    edges = []
    seen = set()
    for path in paths.values():
        for a, b in pairwise(path):
            key = (a, b)
            if key not in seen:
                seen.add(key)
                data = graph.edges[a, b]
                edges.append(
                    {
                        "id": f"E{len(edges)}",
                        "a": a,
                        "b": b,
                        "length": round(data["length"], 4),
                        "points": data["points"],
                        "trunk": bool(data["cross"] or a == "S"),
                    }
                )
    return edges
