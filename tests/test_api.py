import json
import threading

import pytest
from fastapi.testclient import TestClient

from engine import api as module
from engine.models import Scene
from engine.optimizer import Cancelled


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "RUN_DIR", tmp_path)
    with TestClient(module.app) as c:
        yield c


def test_health_and_validation(client):
    assert client.get("/api/health").json()["model"] == "offline"
    assert client.post("/api/preview", json={"source": [0, 0]}).status_code == 422
    result = client.post("/api/preview", json=Scene().model_dump())
    assert result.status_code == 200
    assert len(result.json()["nodes"]) == 108


@pytest.mark.parametrize(
    "text,patch",
    [
        ("预算改成1.8万", {"budget": 18000}),
        ("高差改成25米", {"rise": 25}),
        ("budget 18k", {"budget": 18000}),
        ("rise 25m", {"rise": 25}),
    ],
)
def test_local_intent(client, text, patch):
    result = client.post("/api/intent", json={"text": text}).json()
    assert result["provider"] == "local_rules"
    assert result["patch"] == patch


@pytest.mark.parametrize(
    "text", ["不要把预算改成18000", "预算18000，高差20", "写一份农药配方", ""]
)
def test_intent_rejects_ambiguous_or_unsupported_commands(client, text):
    assert client.post("/api/intent", json={"text": text}).status_code == 422


def test_sse_revision_order_resume_and_disk_export(client):
    started = client.post("/api/runs", json=Scene().model_dump())
    assert started.status_code == 202
    ident = started.json()["run_id"]
    with client.stream("GET", f"/api/runs/{ident}/events") as stream:
        events = [
            json.loads(line[6:])
            for line in stream.iter_lines()
            if line.startswith("data: ")
        ]
    assert events[-1]["type"] == "complete"
    assert all(e["revision"] == started.json()["revision"] for e in events)
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    export = client.get(f"/api/runs/{ident}/export").json()
    assert export["events"] == events
    resume = client.get(
        f"/api/runs/{ident}/events", headers={"Last-Event-ID": str(len(events) - 1)}
    )
    assert sum(line.startswith("data: ") for line in resume.text.splitlines()) == 1
    assert client.get("/api/runs/missing/events").status_code == 404


def test_api_cancel_emits_terminal_event(client, monkeypatch):
    entered = threading.Event()
    finished = threading.Event()

    def slow(scene, emit, cancel):
        entered.set()
        try:
            if not cancel.wait(3):
                raise AssertionError("cancellation was not delivered")
            raise Cancelled()
        finally:
            finished.set()

    monkeypatch.setattr(module, "optimize", slow)
    ident = client.post("/api/runs", json={}).json()["run_id"]
    assert entered.wait(1)
    assert client.post(f"/api/runs/{ident}/cancel").status_code == 200
    response = client.get(f"/api/runs/{ident}/events")
    assert '"type": "cancelled"' in response.text
    assert finished.is_set()


def test_preview_supplies_both_constructible_routes_for_replay(client):
    g = client.post("/api/preview", json=Scene().model_dump()).json()
    assert len(g["routes"]) == 2
    assert len(g["corridors"]) == g["candidate_edges"]
    for route in g["routes"]:
        assert len(route) == len(g["nodes"])
        assert {e["b"] for e in route} == {n["id"] for n in g["nodes"]}
