import itertools
import random
import time
from collections import Counter

from .geometry import make_geometry, network_tree
from .hydraulics import CATALOG_VERSION, PUMPS, cost_plan, simulate


class Cancelled(Exception):
    pass


def optimize(scene, emit, cancelled):
    started = time.monotonic()

    def check():
        if cancelled.is_set():
            raise Cancelled()
        if time.monotonic() - started > 150:
            raise TimeoutError(
                "Run exceeded 150 seconds; reduce the plot size or node count"
            )

    geom, graph, byid = make_geometry(scene)
    emit(
        "terrain",
        {
            "message": f"Terrain ready · {len(geom['nodes'])} service nodes",
            "nodes": len(geom["nodes"]),
            "edges": geom["candidate_edges"],
        },
    )
    if geom["unreachable"]:
        emit(
            "complete",
            {
                "status": "infeasible",
                "message": f"{len(geom['unreachable'])} nodes cannot reach the source because of boundaries or exclusions",
                "plans": [],
                "candidates": [],
                "unreachable": geom["unreachable"],
                "elapsed_s": round(time.monotonic() - started, 3),
            },
        )
        return
    trees = [network_tree(scene, graph, byid, k) for k in range(2)]
    configurations = list(
        itertools.product(range(2), [32, 40, 50], [25, 32], range(3), [1, 2, 3])
    )
    candidates = []
    feasible = []
    hydraulic = []
    reasons = Counter()
    emitted = 0
    emit(
        "graph",
        {
            "message": f"{len(graph.edges)} candidate routes · {len(configurations)} configurations",
            "total": len(configurations),
        },
    )
    for i, (layout, trunk, lateral, pumpidx, zones) in enumerate(configurations):
        check()
        pump = PUMPS[pumpidx]
        edges = trees[layout]
        result = simulate(
            scene, geom["nodes"], geom["source"], edges, trunk, lateral, pump, zones
        )
        price, bom = cost_plan(scene, geom["nodes"], edges, trunk, lateral, pump, zones)
        violations = list(result["violations"])
        hydraulically_valid = not violations
        if price > scene.budget:
            violations.append("Over budget")
        good = not violations
        ident = f"P{i + 1:03}"
        summary = {
            "id": ident,
            "cost": price,
            "duration_min": result["duration_min"],
            "energy_kwh": result["energy_kwh"],
            "min_pressure": result["min_pressure"],
            "feasible": good,
            "violations": violations,
            "zones": zones,
            "trunk_mm": trunk,
            "lateral_mm": lateral,
            "pump": pump["id"],
            "layout": layout,
        }
        candidates.append(summary)
        reasons.update(violations)
        plan = {
            **summary,
            **result,
            "feasible": good,
            "violations": violations,
            "bom": bom,
            "edges": edges,
            "length_m": round(sum(e["length"] for e in edges), 1),
            "pump_spec": pump,
            "coverage": 1.0,
            "catalog": CATALOG_VERSION,
        }
        if hydraulically_valid:
            hydraulic.append(plan)
        if good:
            feasible.append(plan)
        if i % 4 == 0 or i == len(configurations) - 1:
            emit(
                "search",
                {
                    "message": f"Checked {i + 1}/{len(configurations)} · {len(feasible)} feasible",
                    "evaluated": i + 1,
                    "total": len(configurations),
                    "feasible_count": len(feasible),
                    "candidates": candidates[emitted:],
                    "latest": summary,
                    "visual": {
                        "pressures": result.get("pressures", {}),
                        "outflows_lpm": result.get("outflows_lpm", {}),
                    },
                    "best_cost": min((p["cost"] for p in feasible), default=None),
                    "rejections": dict(reasons),
                },
            )
            emitted = len(candidates)
    if not feasible:
        emit(
            "complete",
            {
                "status": "infeasible",
                "message": "No feasible plan. Check the budget, source flow and pressure requirements.",
                "plans": [],
                "candidates": candidates,
                "rejections": dict(reasons),
                "minimum_valid_cost": min((p["cost"] for p in hydraulic), default=None),
                "elapsed_s": round(time.monotonic() - started, 3),
            },
        )
        return
    # Exact non-dominance over this finite catalog search, not a global optimum claim.
    frontier = [
        p
        for p in feasible
        if not any(
            q["cost"] <= p["cost"]
            and q["duration_min"] <= p["duration_min"]
            and (q["cost"] < p["cost"] or q["duration_min"] < p["duration_min"])
            for q in feasible
        )
    ]
    lo = min(p["cost"] for p in frontier)
    hi = max(p["cost"] for p in frontier)
    tlo = min(p["duration_min"] for p in frontier)
    thi = max(p["duration_min"] for p in frontier)
    balanced = min(
        frontier,
        key=lambda p: (
            (p["cost"] - lo) / max(hi - lo, 1)
            + (p["duration_min"] - tlo) / max(thi - tlo, 0.01)
        ),
    )
    selected = []
    for label, p in [
        ("balanced", balanced),
        ("economy", min(feasible, key=lambda p: p["cost"])),
        ("fast", min(feasible, key=lambda p: p["duration_min"])),
    ]:
        if p["id"] not in [a["id"] for a in selected]:
            selected.append({**p, "label": label})
    rng = random.Random(scene.seed + 1009)
    samples = [
        (rng.uniform(0.95, 1.05), rng.uniform(0.9, 1.1), rng.uniform(-1, 1))
        for _ in range(12)
    ]
    for p in selected:
        passed = 0
        lowest = float("inf")
        emit(
            "validation",
            {
                "message": f"Checking {p['id']} · 12 sensitivity scenarios",
                "plan_id": p["id"],
            },
        )
        for n, (hf, rf, eo) in enumerate(samples):
            check()
            r = simulate(
                scene,
                geom["nodes"],
                geom["source"],
                p["edges"],
                p["trunk_mm"],
                p["lateral_mm"],
                p["pump_spec"],
                p["zones"],
                head_factor=hf,
                roughness_factor=rf,
                elevation_offset=eo,
            )
            passed += not bool(r["violations"])
            lowest = min(lowest, r["min_pressure"])
        p["robustness"] = {
            "passed": passed,
            "total": len(samples),
            "sample_min_pressure": round(lowest, 4),
            "seed": scene.seed + 1009,
            "assumptions": "Pump head ±5%, roughness ±10%, correlated elevation error ±1 m; independent uniform sampling for sensitivity checks",
        }
    emit(
        "complete",
        {
            "status": "complete",
            "message": f"Complete · {len(feasible)} feasible configurations, {len(selected)} selected plans",
            "plans": selected,
            "pareto_ids": [p["id"] for p in frontier],
            "candidates": candidates,
            "rejections": dict(reasons),
            "elapsed_s": round(time.monotonic() - started, 3),
            "evaluated": len(candidates),
            "feasible_count": len(feasible),
            "solver": "EPANET 2.2 / Darcy–Weisbach",
            "search": "Finite catalog search · 108 configurations",
            "seed": scene.seed,
        },
    )
