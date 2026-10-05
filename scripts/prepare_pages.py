"""Capture real Nemotron proposals and engineering results for the Pages showcase."""

import json
import os
import threading
from pathlib import Path

from engine.api import preview
from engine.demo import StudyInputs, StudyRequest, study
from engine.design import DesignRequest, resolve_design
from engine.models import Scene
from engine.optimizer import optimize

ROOT = Path(__file__).resolve().parents[1]


def main():
    os.environ["DEMETER_MODEL_PROVIDER"] = "nebius"
    fixtures = json.loads((ROOT / "examples/design-prompts.json").read_text())
    overrides = {
        "mountain": ({"budget": 46000}, {}),
        "glass": (
            {"name": "Sunfield Orchard", "rise": 4, "budget": 50000},
            {"day": 355, "greenhouses": 3},
        ),
        "flight": (
            {"name": "Cloudridge Orchard", "rise": 38, "budget": 48000},
            {"day": 355, "swath_m": 4},
        ),
    }
    output = ROOT / "apps/web/public/showcase"
    output.mkdir(parents=True, exist_ok=True)
    for fixture in fixtures:
        scene_edits, input_edits = overrides[fixture["id"]]
        resolved = resolve_design(
            DesignRequest(
                prompt=fixture["prompt"],
                scene=Scene(width=180, depth=105, **scene_edits),
                inputs=StudyInputs(**input_edits),
            )
        )
        assert resolved["status"] == "ready", resolved
        scene = Scene.model_validate(resolved["scene"])
        resolved["geometry"] = preview(scene)
        inputs = StudyInputs.model_validate(resolved["inputs"])
        for scope in ("scene", "inputs"):
            assert all(resolved[scope][k] == v for k, v in fixture[scope].items()), (
                fixture["id"]
            )
        events = []
        optimize(
            scene,
            lambda kind, data, events=events: events.append(
                {"type": kind, "data": data, "seq": len(events)}
            ),
            threading.Event(),
        )
        result = events[-1]["data"]
        assert result["status"] == "complete" and result["plans"]
        payload = {
            "design": resolved,
            "study": study(StudyRequest(scene=scene, inputs=inputs)),
            "events": events,
        }
        (output / f"{fixture['id']}.json").write_text(
            json.dumps(payload, separators=(",", ":")) + "\n"
        )
        print(
            f"{fixture['id']}: {len(resolved['geometry']['nodes'])} nodes, {len(events)} solver events",
            flush=True,
        )


if __name__ == "__main__":
    main()
