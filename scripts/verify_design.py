"""Verify the planner -> geometry -> studies -> EPANET -> export workflow.

Defaults to offline verification. --provider nebius makes a real model request.
"""

import argparse
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
from fastapi.testclient import TestClient

from engine import api
from engine.demo import StudyInputs
from engine.models import Scene

PROMPT = "Plan a 160 x 90 m orchard; rise 12 m; budget 40k; two greenhouses; winter; swath 4 m."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("mock", "nebius"), default="mock")
    parser.add_argument("--prompt", default=PROMPT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-url", help="Verify an already running HTTP deployment")
    args = parser.parse_args()
    previous = os.environ.get("DEMETER_MODEL_PROVIDER")
    original_run_dir = api.RUN_DIR
    os.environ["DEMETER_MODEL_PROVIDER"] = args.provider
    try:
        with TemporaryDirectory(prefix="demeter-design-") as directory:
            api.RUN_DIR = Path(directory)
            client_context = (
                httpx.Client(base_url=args.base_url, timeout=120)
                if args.base_url
                else TestClient(api.app)
            )
            with client_context as client:
                resolved = client.post(
                    "/api/design",
                    json={
                        "prompt": args.prompt,
                        "scene": Scene().model_dump(mode="json"),
                        "inputs": StudyInputs().model_dump(),
                    },
                )
                resolved.raise_for_status()
                design = resolved.json()
                assert design["status"] == "ready"
                assert design["trace"]["provider"] == args.provider
                if args.prompt == PROMPT:
                    assert all(
                        design["scene"][k] == v
                        for k, v in {
                            "width": 160,
                            "depth": 90,
                            "rise": 12,
                            "budget": 40000,
                        }.items()
                    )
                    assert all(
                        design["inputs"][k] == v
                        for k, v in {
                            "greenhouses": 2,
                            "day": 355,
                            "swath_m": 4,
                        }.items()
                    )
                response = client.post(
                    "/api/study",
                    json={
                        "scene": design["scene"],
                        "inputs": design["inputs"],
                    },
                )
                response.raise_for_status()
                study = response.json()
                response = client.post("/api/runs", json=design["scene"])
                response.raise_for_status()
                run = response.json()
                response = client.get(f"/api/runs/{run['run_id']}/events")
                response.raise_for_status()
                events = [
                    json.loads(line[6:])
                    for line in response.text.splitlines()
                    if line.startswith("data: ")
                ]
                assert events[-1]["type"] == "complete"
                result = events[-1]["data"]
                assert result["plans"] and len(result["candidates"]) == 108
                assert (
                    study["revision"] == design["trace"]["revision"] == run["revision"]
                )
                exported = client.get(f"/api/runs/{run['run_id']}/export").json()
                assert (
                    exported["scene"] == design["scene"]
                    and exported["events"] == events
                )
                report = {
                    "design": design["trace"],
                    "scene": design["scene"],
                    "inputs": design["inputs"],
                    "nodes": len(design["geometry"]["nodes"]),
                    "greenhouses": len(study["greenhouses"]),
                    "mean_sun_hours": study["light"]["mean_hours"],
                    "coverage_pct": study["drone"]["coverage_pct"],
                    "annual_revenue_cny": study["economics"]["revenue"],
                    "evaluated": len(result["candidates"]),
                    "feasible": result["feasible_count"],
                    "plans": [
                        {
                            k: p[k]
                            for k in ("id", "cost", "duration_min", "min_pressure")
                        }
                        for p in result["plans"]
                    ],
                    "events": len(events),
                    "export_verified": True,
                }
                path = args.output or Path(
                    f"artifacts/{args.provider}-design-validation.json"
                    if args.provider != "mock"
                    else "artifacts/design-validation.json"
                )
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(report, indent=2) + "\n")
                print(json.dumps(report, indent=2))
    finally:
        api.RUN_DIR = original_run_dir
        if previous is None:
            os.environ.pop("DEMETER_MODEL_PROVIDER", None)
        else:
            os.environ["DEMETER_MODEL_PROVIDER"] = previous


if __name__ == "__main__":
    main()
