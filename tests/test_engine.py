"""Independent physics checks, geometry invariants, and real solver integration."""

import math
import threading

import pytest
from pydantic import ValidationError
from scipy.optimize import brentq
from shapely.geometry import LineString, Point

from engine.geometry import (
    elevation,
    exclusion_polygon,
    make_geometry,
    network_tree,
    plot_polygon,
)
from engine.hydraulics import (
    NOMINAL_HEAD,
    NOZZLE_LPM,
    PUMPS,
    RHO_G,
    simulate,
)
from engine.models import Scene
from engine.optimizer import Cancelled, optimize


def test_scene_rejects_self_intersection_and_invalid_pressure():
    with pytest.raises(ValidationError):
        Scene(boundary=[(0.1, 0.1), (0.9, 0.9), (0.1, 0.9), (0.9, 0.1)])
    with pytest.raises(ValidationError):
        Scene(min_pressure=0.6, max_pressure=0.5)
    with pytest.raises(ValidationError):
        Scene(source=(0, 0))
    with pytest.raises(ValidationError):
        Scene(width=float("nan"))


def test_normalized_scene_roundtrip_and_revision():
    scene = Scene()
    assert (
        Scene.model_validate_json(scene.model_dump_json()).revision()
        == scene.revision()
    )
    assert Scene(rise=33).revision() != scene.revision()


def test_geometry_is_connected_and_paths_follow_terrain():
    scene = Scene()
    geom, graph, byid = make_geometry(scene)
    assert len(geom["nodes"]) == 108
    assert geom["unreachable"] == []
    assert max(geom["mesh"][2::3]) == scene.rise
    for layout in (0, 1):
        edges = network_tree(scene, graph, byid, layout)
        assert len(edges) == len(geom["nodes"])
        for edge in edges:
            assert (
                edge["length"]
                >= math.dist(edge["points"][0], edge["points"][-1]) - 1e-3
            )
            assert (
                plot_polygon(scene)
                .buffer(1e-6)
                .covers(LineString([p[:2] for p in edge["points"]]))
            )
            for x, y, z in edge["points"]:
                assert z == pytest.approx(elevation(scene, x, y) + 1.5, abs=2e-4)


def test_exclusions_remove_planting_and_construction():
    s = Scene(exclusions=[[(0.35, 0.3), (0.5, 0.3), (0.5, 0.5), (0.35, 0.5)]])
    geom, graph, _ = make_geometry(s)
    excluded = exclusion_polygon(s)
    assert len(geom["nodes"]) < 108
    assert not any(excluded.covers(Point(n["x"], n["y"])) for n in geom["nodes"])
    assert not any(
        LineString([(p[0], p[1]) for p in e["points"]]).intersects(excluded)
        for _, _, e in graph.edges(data=True)
    )


def test_disconnected_plot_has_no_false_feasible_solution():
    s = Scene(exclusions=[[(0.01, 0.43), (0.99, 0.43), (0.99, 0.58), (0.01, 0.58)]])
    events = []
    optimize(s, lambda t, d: events.append((t, d)), threading.Event())
    assert events[-1][1]["status"] == "infeasible"
    assert events[-1][1]["unreachable"]
    assert events[-1][1]["plans"] == []


def test_epanet_against_independent_one_pipe_laminar_solution():
    # Q determines nozzle head. Balance a quadratic pump curve, elevation,
    # analytical laminar Darcy loss, and the specified minor loss.
    scene = Scene(rise=0)
    source = {"id": "S", "x": 0, "y": 0, "z": 1.5}
    nodes = [{"id": "T", "x": 40, "y": 0, "z": 6.5}]
    edges = [{"id": "E", "a": "S", "b": "T", "length": 40, "trunk": True}]
    pump = PUMPS[0]
    diameter = 0.04
    k = NOZZLE_LPM / 60000 / math.sqrt(NOMINAL_HEAD)

    def residual(q):
        velocity = 4 * q / (math.pi * diameter**2)
        return (
            pump["head"] * (1 - 0.2 * (q / pump["q_nom"]) ** 2)
            - 5
            - (q / k) ** 2
            - 128 * 1.02e-6 * 40 * q / (math.pi * 9.80665 * diameter**4)
            - 1.5 * velocity**2 / (2 * 9.80665)
        )

    q = brentq(residual, 1e-8, 0.0001, xtol=1e-15)
    assert 4 * q / (math.pi * diameter * 1.02e-6) < 2000
    result = simulate(scene, nodes, source, edges, 40, 25, pump, 1)
    assert result["converged"]
    assert result["outflows_lpm"]["T"] == pytest.approx(q * 60000, rel=0.002)
    assert result["pressures"]["T"] == pytest.approx(
        (q / k) ** 2 * RHO_G / 1e6, rel=0.002
    )
    assert result["mass_residual_m3s"] < 1e-8


def test_supply_constraint_cannot_be_ignored():
    scene = Scene(source_lpm=5)
    g, G, ids = make_geometry(scene)
    result = simulate(
        scene,
        g["nodes"],
        g["source"],
        network_tree(scene, G, ids, 0),
        40,
        25,
        PUMPS[1],
        2,
    )
    assert "Insufficient source flow" in result["violations"]
    assert result["flow_lpm"] > scene.source_lpm


@pytest.fixture(scope="module")
def solved():
    events = []
    optimize(Scene(), lambda t, d: events.append((t, d)), threading.Event())
    return events


def test_full_search_and_event_batches_are_complete_and_unique(solved):
    result = solved[-1][1]
    assert result["status"] == "complete"
    assert len(result["candidates"]) == 108
    assert result["feasible_count"] == sum(p["feasible"] for p in result["candidates"])
    streamed = [c["id"] for t, d in solved if t == "search" for c in d["candidates"]]
    assert len(streamed) == len(set(streamed)) == 108
    assert [p["label"] for p in result["plans"]] == ["balanced", "economy", "fast"]


def test_plans_satisfy_budget_physics_and_bom(solved):
    s = Scene()
    for p in solved[-1][1]["plans"]:
        assert not p["violations"]
        assert p["cost"] <= s.budget
        assert p["min_pressure"] >= s.min_pressure
        assert p["network_max_pressure"] <= s.max_pressure
        assert p["mass_residual_m3s"] < 1e-6
        assert len(p["pressures"]) == 108
        assert p["cost"] == pytest.approx(sum(b["subtotal"] for b in p["bom"]))
        assert p["robustness"]["total"] == 12
        assert 0 <= p["robustness"]["passed"] <= 12
    # Guard against replacing actual sensitivity results with a perfect score.
    assert any(p["robustness"]["passed"] < 12 for p in solved[-1][1]["plans"])


def test_frontier_is_not_dominated(solved):
    r = solved[-1][1]
    candidates = {p["id"]: p for p in r["candidates"]}
    for ident in r["pareto_ids"]:
        p = candidates[ident]
        assert not any(
            q["feasible"]
            and q["cost"] <= p["cost"]
            and q["duration_min"] <= p["duration_min"]
            and (q["cost"] < p["cost"] or q["duration_min"] < p["duration_min"])
            for q in candidates.values()
        )


def test_infeasible_budget_returns_honest_lower_bound():
    events = []
    optimize(Scene(budget=100), lambda t, d: events.append((t, d)), threading.Event())
    result = events[-1][1]
    assert result["status"] == "infeasible"
    assert result["plans"] == []
    assert result["minimum_valid_cost"] > 100
    assert all("Over budget" in p["violations"] for p in result["candidates"])


def test_cancel_stops_search():
    stop = threading.Event()
    stop.set()
    with pytest.raises(Cancelled):
        optimize(Scene(), lambda *_: None, stop)


def test_visual_frames_match_actual_candidate_hydraulics(solved):
    frames = [d for kind, d in solved if kind == "search"]
    assert len(frames) > 10
    for frame in frames:
        pressures = frame["visual"]["pressures"]
        candidate = frame["latest"]
        if pressures:
            assert len(pressures) == 108
            assert min(pressures.values()) == candidate["min_pressure"]
            assert len(frame["visual"]["outflows_lpm"]) == 108
    assert len({tuple(d["visual"]["pressures"].values()) for d in frames}) > 3


@pytest.mark.parametrize("scene", [Scene(), Scene(width=180, depth=105, rise=38)])
def test_surface_mesh_matches_every_tree_root_and_covers_plot(scene):
    """Catch Delaunay triangles bridging terrace folds at oblique boundaries."""
    import numpy as np
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    geom, _, _ = make_geometry(scene)
    triangles = np.array(geom["mesh"]).reshape(-1, 3, 3)
    footprint = unary_union([Polygon(t[:, :2]) for t in triangles])
    assert footprint.symmetric_difference(plot_polygon(scene)).area < 1e-4
    for node in geom["nodes"]:
        matches = []
        for tri in triangles:
            a, b, c = tri
            basis = np.column_stack((b[:2] - a[:2], c[:2] - a[:2]))
            if abs(np.linalg.det(basis)) < 1e-9:
                continue
            u, v = np.linalg.solve(basis, np.array([node["x"], node["y"]]) - a[:2])
            if min(u, v, 1 - u - v) >= -1e-6:
                matches.append(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]))
        assert matches, node["id"]
        assert max(abs(z - (node["z"] - 1.5)) for z in matches) < 1e-5
