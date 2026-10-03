import math
from itertools import pairwise

import pytest
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

from engine.demo import (
    StudyInputs,
    StudyRequest,
    drone_study,
    greenhouse_sites,
    study,
    sun_vector,
)
from engine.geometry import exclusion_polygon, plot_polygon
from engine.models import Scene


def test_solar_geometry_seasons_and_local_solar_time():
    noon = sun_vector(30.6, 172, 12)
    winter = sun_vector(30.6, 355, 12)
    assert math.isclose(sum(v * v for v in noon), 1, abs_tol=1e-10)
    assert noon[0] == pytest.approx(0)
    assert noon[2] > winter[2] > 0
    assert sun_vector(30.6, 172, 9)[0] > 0  # east in morning
    assert sun_vector(30.6, 172, 15)[0] < 0  # west in afternoon
    assert sun_vector(30.6, 172, 0)[2] < 0


def test_protected_nodes_and_light_do_not_double_count_yield():
    scene = Scene(rise=4)
    inputs = StudyInputs(greenhouses=3, day=355)
    result = study(StudyRequest(scene=scene, inputs=inputs))
    assert len(result["greenhouses"]) == 3
    nodes = result["light"]["nodes"]
    protected = [n for n in nodes.values() if n["protected"]]
    assert protected
    assert all(
        n["effective_hours"] == pytest.approx(n["direct_hours"] * 0.72, abs=0.006)
        for n in protected
    )
    assert result["economics"]["yield_kg"] == pytest.approx(
        35 * (len(nodes) - len(protected) + 1.2 * len(protected))
    )
    assert result["economics"]["greenhouse_capex"] == 3 * 20 * 9 * 150
    assert all(
        0 <= n["direct_hours"] <= result["light"]["daylight_hours"]
        for n in nodes.values()
    )


def test_drone_continuity_obstacle_clearance_and_coverage():
    scene = Scene(
        rise=4, exclusions=[[(0.45, 0.4), (0.55, 0.4), (0.55, 0.6), (0.45, 0.6)]]
    )
    inputs = StudyInputs(greenhouses=3)
    sites = greenhouse_sites(scene, inputs)
    result = drone_study(scene, sites, inputs)
    target = (
        plot_polygon(scene)
        .buffer(-2)
        .difference(exclusion_polygon(scene).buffer(3, join_style=2))
        .difference(
            unary_union([box(*s["bounds"]).buffer(3, join_style=2) for s in sites])
        )
    )
    segments = result["segments"]
    assert len(segments) > 10 and any(not s["spray"] for s in segments)
    for s in segments:
        assert target.buffer(1e-6).covers(LineString([s["a"][:2], s["b"][:2]]))
        assert s["a"][2] == s["b"][2] == scene.rise + 12
    for a, b in pairwise(segments):
        assert a["b"] == pytest.approx(b["a"])
    assert 80 < result["coverage_pct"] <= 100
    assert result["duration_min"] == pytest.approx(
        result["distance_m"] / inputs.drone_speed_ms / 60, abs=0.006
    )
    coverage = (
        unary_union(
            [
                LineString([s["a"][:2], s["b"][:2]]).buffer(
                    inputs.swath_m / 2, cap_style=2
                )
                for s in segments
                if s["spray"]
            ]
        )
        .intersection(target)
        .area
    )
    assert result["covered_area_m2"] == pytest.approx(coverage, abs=0.006)
    for site in sites:
        assert plot_polygon(scene).covers(box(*site["bounds"]))
        assert not exclusion_polygon(scene).covers(Point(site["x"], site["y"]))


def test_study_rejects_non_finite_and_invalid_inputs():
    with pytest.raises(ValueError):
        StudyInputs(transmission=float("nan"))
    with pytest.raises(ValueError):
        StudyInputs(swath_m=0)
