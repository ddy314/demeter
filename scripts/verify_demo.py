"""Repeat all shipped presets against both local study and EPANET engines."""

import json
import threading
from pathlib import Path

from engine.demo import StudyInputs, StudyRequest, study
from engine.models import Scene
from engine.optimizer import optimize

rows = []
for ident, name, rise, budget, day, houses, width in [
    ("mountain", "Azure Terraces", 32, 46000, 172, 0, 5),
    ("glass", "Sunfield Orchard", 4, 50000, 355, 3, 5),
    ("flight", "Cloudridge Orchard", 38, 48000, 355, 0, 4),
]:
    scene = Scene(name=name, width=180, depth=105, rise=rise, budget=budget)
    value = study(
        StudyRequest(
            scene=scene, inputs=StudyInputs(day=day, greenhouses=houses, swath_m=width)
        )
    )
    events = []
    optimize(
        scene,
        lambda kind, payload, events=events: events.append((kind, payload)),
        threading.Event(),
    )
    result = events[-1][1]
    assert result["status"] == "complete" and len(result["plans"]) == 3
    rows.append(
        {
            "preset": ident,
            "revision": scene.revision(),
            "greenhouses": len(value["greenhouses"]),
            "mean_sun_hours": value["light"]["mean_hours"],
            "coverage_pct": value["drone"]["coverage_pct"],
            "distance_m": value["drone"]["distance_m"],
            "duration_min": value["drone"]["duration_min"],
            "feasible": result["feasible_count"],
            "plans": [p["id"] for p in result["plans"]],
        }
    )
Path("artifacts/demo-validation.json").write_text(
    json.dumps(rows, ensure_ascii=False, indent=2)
)
print(json.dumps(rows, ensure_ascii=False, indent=2))
