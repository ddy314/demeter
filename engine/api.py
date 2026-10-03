import asyncio
import json
import logging
import os
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .demo import StudyRequest, study
from .design import DesignError, DesignRequest, configuration, resolve_design
from .geometry import make_geometry, network_tree
from .models import Scene
from .optimizer import Cancelled, optimize

ROOT = Path(__file__).resolve().parents[1]
RUN_DIR = Path(os.environ.get("DEMETER_RUN_DIR", str(ROOT / "data/runs")))
RUN_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Demeter local engineering", version="0.1.0")
executor = ThreadPoolExecutor(max_workers=1)
runs = {}
lock = threading.Lock()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "solver": "EPANET 2.2",
        "model": configuration()["provider"],
        "catalog": "synthetic-water-v1",
    }


@app.get("/api/design/config")
def design_config():
    return configuration()


@app.post("/api/design")
def design(request: DesignRequest):
    try:
        result = resolve_design(request)
        if result["status"] == "ready":
            result["geometry"] = preview(Scene.model_validate(result["scene"]))
        return result
    except DesignError as e:
        raise HTTPException(e.status, str(e)) from e


@app.post("/api/study")
def demo_study(request: StudyRequest):
    try:
        return study(request)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/api/preview")
def preview(scene: Scene):
    try:
        geom, graph, byid = make_geometry(scene)
        routes = (
            []
            if geom["unreachable"]
            else [network_tree(scene, graph, byid, k) for k in range(2)]
        )
        return {
            **geom,
            "revision": scene.revision(),
            "routes": routes,
            "corridors": [e["points"] for _, _, e in graph.edges(data=True)],
        }
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def work(ident, scene):
    run = runs[ident]

    def emit(kind, payload):
        event = {
            "seq": len(run["events"]) + 1,
            "run_id": ident,
            "revision": scene.revision(),
            "type": kind,
            "at": datetime.now(UTC).isoformat(),
            "data": payload,
        }
        run["events"].append(event)
        with (RUN_DIR / (ident + ".jsonl")).open("a") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        if kind in ["complete", "cancelled", "error"]:
            run["status"] = kind

    try:
        optimize(scene, emit, run["cancel"])
    except Cancelled:
        emit("cancelled", {"message": "Run cancelled"})
    except Exception as e:
        logging.getLogger(__name__).exception("Run %s failed", ident)
        emit(
            "error",
            {
                "message": str(e)
                if isinstance(e, (ValueError, TimeoutError))
                else "Hydraulic solve failed; check the service log"
            },
        )


@app.post("/api/runs", status_code=202)
def start_run(scene: Scene):
    with lock:
        if sum(r["status"] == "running" for r in runs.values()) >= 2:
            raise HTTPException(429, "Two runs are already active; cancel one or wait")
        if len(runs) >= 32:
            for key in list(runs):
                if runs[key]["status"] != "running":
                    del runs[key]
                    break
        ident = uuid.uuid4().hex
        runs[ident] = {
            "events": [],
            "status": "running",
            "cancel": threading.Event(),
            "scene": scene.model_dump(),
        }
        (RUN_DIR / (ident + ".json")).write_text(
            json.dumps(
                {"scene": scene.model_dump(), "revision": scene.revision()},
                ensure_ascii=False,
                indent=2,
            )
        )
        executor.submit(work, ident, scene)
    return {"run_id": ident, "revision": scene.revision()}


@app.get("/api/runs/{ident}/events")
async def events(ident: str, request: Request, after: int = 0):
    if ident not in runs:
        raise HTTPException(404, "Run not found; start a new run")
    try:
        cursor = max(after, int(request.headers.get("last-event-id", "0")))
    except ValueError:
        raise HTTPException(400, "Invalid event sequence")
    run = runs[ident]

    async def stream():
        nonlocal cursor
        idle = 0
        while True:
            if await request.is_disconnected():
                return
            pending = [e for e in run["events"] if e["seq"] > cursor]
            for event in pending:
                cursor = event["seq"]
                yield f"id: {cursor}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            if run["status"] != "running" and cursor >= len(run["events"]):
                return
            idle += 1
            if idle % 100 == 0:
                yield ": keepalive\n\n"
            await asyncio.sleep(0.1)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/runs/{ident}/cancel")
def cancel(ident: str):
    if ident not in runs:
        raise HTTPException(404, "Run not found")
    runs[ident]["cancel"].set()
    return {"status": "cancellation_requested"}


@app.get("/api/runs/{ident}/export")
def export_run(ident: str):
    if not re.fullmatch("[0-9a-f]{32}", ident):
        raise HTTPException(404, "Run not found")
    path = RUN_DIR / (ident + ".json")
    log = RUN_DIR / (ident + ".jsonl")
    if not path.exists():
        raise HTTPException(404, "Run not found")
    return {
        **json.loads(path.read_text()),
        "events": [json.loads(line) for line in log.read_text().splitlines()]
        if log.exists()
        else [],
    }


class Command(BaseModel):
    text: str = Field(min_length=1, max_length=200)


@app.post("/api/intent")
def intent(command: Command):
    """An explicitly limited offline adapter; never pretends to be an LLM."""
    text = command.text.strip()
    if re.search(r"不改|不要|别|not|don.t", text, re.IGNORECASE):
        raise HTTPException(
            422, "Use the parameter panel for negative or compound instructions."
        )
    patterns = [
        (
            "budget",
            r"(?:预算|budget)\s*(?:改为|改成|设为|为|到|≤|<=|=|to)?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(万|k)?",
        ),
        (
            "rise",
            r"(?:高差|rise)\s*(?:改为|改成|设为|为|到|=|to)?\s*(\d+(?:\.\d+)?)\s*(?:m|米)?",
        ),
    ]
    matches = []
    for field, pattern in patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            value = float(m.group(1))
            if field == "budget" and m.group(2):
                value *= 10000 if m.group(2) == "万" else 1000
            remaining = text[: m.start()] + text[m.end() :]
            if remaining.strip(" 。.!！"):
                raise HTTPException(
                    422,
                    "Enter one budget or rise command at a time, or use the parameter panel.",
                )
            matches.append((field, value))
    if len(matches) != 1:
        raise HTTPException(422, "Use budget 18000 or rise 25m.")
    key, value = matches[0]
    return {
        "provider": "local_rules",
        "patch": {key: value},
        "message": "Parameters updated. Generate plans to recalculate.",
    }


DIST = ROOT / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(DIST / "index.html")
