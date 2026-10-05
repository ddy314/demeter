"""Verify six bounded, real Nemotron interpretation cases using Token Factory."""

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from engine.demo import StudyInputs
from engine.design import DesignRequest, Settings, resolve_design
from engine.models import Scene

ROOT = Path(__file__).resolve().parents[1]


def main():
    os.environ["DEMETER_MODEL_PROVIDER"] = "nebius"
    settings = Settings()
    if not settings.key or not settings.model.lower().startswith("nvidia/"):
        raise ValueError("Configure NEBIUS_API_KEY and an NVIDIA NEBIUS_MODEL first")
    fixtures = json.loads((ROOT / "examples/design-prompts.json").read_text())
    cases = []
    for fixture in fixtures:
        overrides = {
            "mountain": {"rise": 32, "budget": 46000},
            "glass": {"name": "Sunfield Orchard", "rise": 4, "budget": 50000},
            "flight": {"name": "Cloudridge Orchard", "rise": 38, "budget": 48000},
        }[fixture["id"]]
        cases.append(
            {
                "id": fixture["id"],
                "prompt": fixture["prompt"],
                "base": Scene(width=180, depth=105, **overrides),
                "expected": {"scene": fixture["scene"], "inputs": fixture["inputs"]},
            }
        )
    cases.extend(
        [
            {
                "id": "natural-language",
                "prompt": "Please make the orchard 160 metres across and 90 metres deep, with a 12-metre rise. Allow CNY 40000 for irrigation, add two greenhouses, examine winter sunlight and use a 4-metre drone swath.",
                "base": Scene(),
                "expected": {
                    "scene": {"width": 160, "depth": 90, "rise": 12, "budget": 40000},
                    "inputs": {"greenhouses": 2, "day": 355, "swath_m": 4},
                },
            },
            {
                "id": "preserve-unspecified",
                "prompt": "Don't change the terrain, irrigation budget or crop assumptions. Just add two greenhouses and study the winter solstice.",
                "base": Scene(),
                "expected": {"scene": {}, "inputs": {"greenhouses": 2, "day": 355}},
            },
            {
                "id": "ambiguous-request",
                "prompt": "Make the orchard better.",
                "base": Scene(),
                "expected": None,
            },
        ]
    )
    results = []
    for case in cases:
        base_inputs = StudyInputs()
        result = resolve_design(
            DesignRequest(
                prompt=case["prompt"],
                scene=case["base"],
                inputs=base_inputs,
            )
        )
        expected = case["expected"]
        if expected is None:
            assert result["status"] == "clarification" and result["question"], case[
                "id"
            ]
            assert result["provider"] == "nebius"
            record = {
                "id": case["id"],
                "passed": True,
                "status": result["status"],
                "question": result["question"],
            }
        else:
            assert result["status"] == "ready", (case["id"], result)
            assert result["trace"]["provider"] == "nebius"
            assert result["trace"]["usage"]["total_tokens"] > 0
            for scope, base in [("scene", case["base"]), ("inputs", base_inputs)]:
                assert result[scope] == {**base.model_dump(), **expected[scope]}, (
                    case["id"],
                    scope,
                    result["trace"]["patch"],
                )
            record = {
                "id": case["id"],
                "passed": True,
                "status": result["status"],
                "trace": result["trace"],
            }
        results.append(record)
        print(
            json.dumps({"id": case["id"], "passed": True, "status": result["status"]}),
            flush=True,
        )
    report = {
        "provider": "nebius",
        "model": settings.model,
        "verified_at": datetime.now(UTC).isoformat(),
        "passed": len(results),
        "cases": results,
    }
    path = ROOT / "artifacts/nebius-interpretation-validation.json"
    path.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
