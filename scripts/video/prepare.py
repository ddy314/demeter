"""Generate the film's input data through the actual application engines."""

import json
import os
import threading
from pathlib import Path

from engine.api import preview
from engine.demo import StudyInputs, StudyRequest, study
from engine.design import DesignRequest, resolve_design
from engine.models import Scene
from engine.optimizer import optimize

os.environ["DEMETER_MODEL_PROVIDER"] = "mock"
prompt = "Plan a 160 x 90 m orchard; rise 12 m; budget 40k; two greenhouses; winter; swath 4 m."
resolved = resolve_design(
    DesignRequest(prompt=prompt, scene=Scene(), inputs=StudyInputs())
)
output = {"prompt": prompt, "trace": resolved["trace"]}
for name, scene, inputs in [
    (
        "custom",
        Scene.model_validate(resolved["scene"]),
        StudyInputs.model_validate(resolved["inputs"]),
    ),
    ("mountain", Scene(width=180, depth=105, rise=32, budget=46000), StudyInputs()),
]:
    events = []
    optimize(
        scene,
        lambda kind, data, events=events: events.append({"type": kind, "data": data}),
        threading.Event(),
    )
    result = events[-1]["data"]
    assert result["status"] == "complete" and result["plans"]
    output[name] = {
        "scene": scene.model_dump(),
        "geom": preview(scene),
        "study": study(StudyRequest(scene=scene, inputs=inputs)),
        "plan": next(
            (p for p in result["plans"] if p["label"] == "balanced"), result["plans"][0]
        ),
        "result": result,
        "events": events,
    }
root = Path(__file__).resolve().parents[2]
path = root / "artifacts/video/work/data.json"
path.parent.mkdir(parents=True, exist_ok=True)
payload = json.dumps(output)
path.write_text(payload)
public = root / "apps/web/public/video-data.json"
public.parent.mkdir(parents=True, exist_ok=True)
public.write_text(payload)
print(
    {
        k: {
            "nodes": len(output[k]["geom"]["nodes"]),
            "plans": len(output[k]["result"]["plans"]),
        }
        for k in ["custom", "mountain"]
    }
)
