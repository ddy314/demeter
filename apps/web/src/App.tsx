import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Download,
  Expand,
  Layers3,
  Leaf,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Upload,
  X,
  Pause,
  Box,
  Scan,
  SkipBack,
  SkipForward,
} from "lucide-react";
const Scene3D = lazy(() => import("./Scene3D"));
import PlotEditor from "./PlotEditor";
import Results from "./Results";
import {
  api,
  DEFAULT,
  download,
  money,
  LABELS,
  type Scene,
  type Geometry,
  type Plan,
  type Candidate,
  type Result,
  type RunEvent,
  type SolverFrame,
} from "./types";
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="slider-label">
      <span>
        {label}
        <b>
          {value}
          <small>{unit}</small>
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
    </label>
  );
}
export default function App({ onDemo }: { onDemo?: () => void }) {
  const [scene, setScene] = useState<Scene>(() => {
      try {
        const s = JSON.parse(
          localStorage.getItem("demeter-scene-v1") || "null",
        );
        if (s?.version !== 1) return DEFAULT;
        const legacyNames: Record<string, string> = {
          "\u9752\u5c9a\u68af\u7530": "Azure Terraces",
          "\u5e73\u5730\u679c\u56ed": "Level Orchard",
        };
        return { ...s, name: legacyNames[s.name] || s.name };
      } catch {
        return DEFAULT;
      }
    }),
    [geom, setGeom] = useState<Geometry>(),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [running, setRunning] = useState(false),
    [previewing, setPreviewing] = useState(true),
    [result, setResult] = useState<Result>(),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [events, setEvents] = useState<RunEvent[]>([]),
    [runId, setRunId] = useState(""),
    [evaluated, setEvaluated] = useState(0),
    [total, setTotal] = useState(108),
    [feasible, setFeasible] = useState(0),
    [pressure, setPressure] = useState(false),
    [clay, setClay] = useState(false),
    [flow, setFlow] = useState(true),
    [cameraMode, setCameraMode] = useState<"perspective" | "top">(
      "perspective",
    ),
    [replayPlaying, setReplayPlaying] = useState(false),
    [reset, setReset] = useState(0),
    [command, setCommand] = useState(""),
    [commandBusy, setCommandBusy] = useState(false),
    [help, setHelp] = useState(false),
    [replay, setReplay] = useState<number | null>(null),
    [ready, setReady] = useState(false);
  const stream = useRef<EventSource | null>(null),
    revision = useRef(""),
    sceneRef = useRef(scene),
    importRef = useRef<HTMLInputElement>(null),
    viewRef = useRef<HTMLElement>(null);
  sceneRef.current = scene;
  const notify = useCallback((m: string) => {
    setToast(m);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    api("/health")
      .then(() => setReady(true))
      .catch(() =>
        setError(
          "Cannot connect to the local engine. Start the app with npm run dev.",
        ),
      );
    return () => stream.current?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPreviewing(true);
    setGeom(undefined);
    setError("");
    setResult(undefined);
    setCandidates([]);
    setEvents([]);
    setEvaluated(0);
    setFeasible(0);
    setRunId("");
    setReplay(null);
    revision.current = "";
    const timer = setTimeout(() => {
      api<Geometry>("/preview", scene, controller.signal)
        .then((g) => {
          setGeom(g);
          revision.current = g.revision;
          setPreviewing(false);
          try {
            localStorage.setItem("demeter-scene-v1", JSON.stringify(scene));
          } catch {
            notify(
              "Browser storage is unavailable. Export your project to save it.",
            );
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setPreviewing(false);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [scene, notify]);
  useEffect(() => {
    if (replay === null || !replayPlaying) return;
    const t = setTimeout(() => {
      if (replay >= events.length) {
        setReplayPlaying(false);
        setReplay(null);
      } else setReplay(replay + 1);
    }, 550);
    return () => clearTimeout(t);
  }, [replay, events.length, replayPlaying]);
  const change = (patch: Partial<Scene>) => {
    if (!running) setScene((s) => ({ ...s, ...patch }));
  };
  const start = async () => {
    if (!geom || previewing || running) return;
    setError("");
    setRunning(true);
    setResult(undefined);
    setCandidates([]);
    setEvents([]);
    setEvaluated(0);
    setFeasible(0);
    setReplay(null);
    try {
      const run = await api<{ run_id: string; revision: string }>(
        "/runs",
        scene,
      );
      setRunId(run.run_id);
      stream.current?.close();
      const es = new EventSource(`/api/runs/${run.run_id}/events`);
      stream.current = es;
      es.onmessage = (message) => {
        const e: RunEvent = JSON.parse(message.data);
        if (e.revision !== revision.current) {
          es.close();
          setRunning(false);
          return;
        }
        setEvents((prev) =>
          prev.some((p) => p.seq === e.seq) ? prev : [...prev, e],
        );
        if (e.type === "graph") setTotal(e.data.total as number);
        if (e.type === "search") {
          setEvaluated(e.data.evaluated as number);
          setFeasible(e.data.feasible_count as number);
          setCandidates((prev) =>
            Array.from(
              new Map(
                [...prev, ...(e.data.candidates as Candidate[])].map((c) => [
                  c.id,
                  c,
                ]),
              ).values(),
            ),
          );
        }
        if (e.type === "complete") {
          const r = e.data as unknown as Result;
          setResult(r);
          setCandidates(r.candidates);
          setSelectedId(r.plans[0]?.id || "");
          setEvaluated(r.candidates.length);
          setFeasible(r.candidates.filter((c) => c.feasible).length);
          setRunning(false);
          es.close();
        }
        if (e.type === "cancelled" || e.type === "error") {
          setRunning(false);
          es.close();
          if (e.type === "error") setError(e.data.message);
          else notify("Run cancelled. You can continue editing the plot.");
        }
      };
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setRunning(false);
          setError("Run connection closed. Generate a new plan to continue.");
        } else setToast("Reconnecting to the run…");
      };
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };
  const cancel = async () => {
    try {
      await api(`/runs/${runId}/cancel`, {});
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const selected: Plan | undefined = result?.plans.find(
    (p) => p.id === selectedId,
  );
  const exportProject = async () => {
    let trace: unknown;
    try {
      if (runId) trace = await api(`/runs/${runId}/export`);
      download(`demeter-${scene.name}.json`, {
        schema: "demeter-project-v1",
        scene,
        revision: geom?.revision,
        result,
        trace,
      });
      notify("Project and calculation records exported");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > 12_000_000) throw new Error("File exceeds 12 MB");
      const data = JSON.parse(await f.text());
      const s = data.scene || data;
      await api("/preview", s);
      setScene(s);
      notify("Plot imported. Run the solver to generate updated results.");
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      e.target.value = "";
    }
  };
  const submitCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || running) return;
    setCommandBusy(true);
    try {
      const r = await api<{ patch: Partial<Scene>; message: string }>(
        "/intent",
        { text: command },
      );
      const updated = { ...scene, ...r.patch };
      await api("/preview", updated);
      setScene(updated);
      setCommand("");
      notify("Constraints updated. Select Generate plans to run the solver.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommandBusy(false);
    }
  };
  const visibleEvents = replay === null ? events : events.slice(0, replay);
  const latest = visibleEvents.at(-1);
  const visualEvent = [...visibleEvents]
    .reverse()
    .find((e) => e.type === "search" && e.data.visual);
  const activeFrame: SolverFrame | undefined =
    (running || replay !== null) && visualEvent && geom?.routes
      ? {
          candidate: visualEvent.data.latest as Candidate,
          pressures: (
            visualEvent.data.visual as { pressures: Record<string, number> }
          ).pressures,
          outflows_lpm: (
            visualEvent.data.visual as { outflows_lpm: Record<string, number> }
          ).outflows_lpm,
          edges: geom.routes[(visualEvent.data.latest as Candidate).layout],
          seq: visualEvent.seq,
        }
      : undefined;
  const traceStage =
    latest?.type === "complete"
      ? 3
      : latest?.type === "validation"
        ? 2
        : latest?.type === "search"
          ? 1
          : 0;

  const shownSearch =
    replay === null
      ? undefined
      : [...visibleEvents].reverse().find((e) => e.type === "search");
  const shownCandidates =
    replay === null
      ? candidates
      : Array.from(
          new Map(
            visibleEvents
              .filter((e) => e.type === "search")
              .flatMap((e) => (e.data.candidates as Candidate[]) || [])
              .map((c) => [c.id, c]),
          ).values(),
        );
  const shownCount =
    replay === null ? evaluated : Number(shownSearch?.data.evaluated || 0);
  const shownFeasible =
    replay === null ? feasible : Number(shownSearch?.data.feasible_count || 0);
  const displayPlan = running || replay !== null ? undefined : selected;
  const progress =
    replay !== null || running
      ? Math.round((shownCount / total) * 100)
      : result
        ? 100
        : 0;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Demeter home">
          <span className="brand-mark">
            d<span />
          </span>
          demeter<span className="brand-sub">Orchard Engineering</span>
        </a>
        <div className="breadcrumb">
          Workspace
          <ChevronRight size={12} />
          <b>{scene.name}</b>
          <span className="version-tag">STUDIO</span>
        </div>
        <div className="header-actions">
          {onDemo && (
            <button
              className="secondary-button"
              onClick={onDemo}
              aria-label="Back to demo"
            >
              ← Demo
            </button>
          )}
          <span className="engine-status">
            <i className={ready ? "status-dot" : "status-dot offline"} />
            {ready ? "Engine ready" : "Connecting"}
          </span>
          <button
            className="icon-button"
            title="Quick guide"
            aria-label="Quick guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          <button
            className="text-button import-button"
            disabled={running}
            onClick={() => importRef.current?.click()}
          >
            <Upload size={14} />
            Import
          </button>
          <button className="secondary-button" onClick={exportProject}>
            <Download size={14} />
            Export project
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importProject}
          />
        </div>
      </header>
      <main className="workspace">
        <aside className="settings-panel">
          <div className="setup-content">
            <div className="panel-heading">
              <span className="eyebrow">SCENE INSPECTOR</span>
              <Settings2 size={15} />
            </div>
            <div className="project-title">
              <h1>Plot settings</h1>
              <span>Shape the land. Set the constraints.</span>
            </div>
            <div className="template-switch">
              <button
                disabled={running}
                className={scene.rise > 0 ? "active" : ""}
                onClick={() => {
                  setScene({ ...DEFAULT, budget: scene.budget });
                }}
              >
                Hillside
              </button>
              <button
                disabled={running}
                className={scene.rise === 0 ? "active" : ""}
                onClick={() =>
                  setScene({
                    ...DEFAULT,
                    rise: 0,
                    name: "Level Orchard",
                    budget: scene.budget,
                  })
                }
              >
                Level Orchard
              </button>
            </div>
            <div className="section-label">
              <span>01</span>Plot & water source
              <small>{geom ? (geom.area_m2 / 10000).toFixed(2) : "—"} ha</small>
            </div>
            <PlotEditor
              scene={scene}
              onChange={(s) => {
                if (!running) setScene(s);
              }}
              disabled={running}
            />
            <div className="dimension-inputs">
              <label>
                Width
                <div>
                  <input
                    aria-label="Width"
                    type="number"
                    min="30"
                    max="200"
                    value={scene.width}
                    disabled={running}
                    onChange={(e) => change({ width: Number(e.target.value) })}
                  />
                  <span>m</span>
                </div>
              </label>
              <span>×</span>
              <label>
                Depth
                <div>
                  <input
                    aria-label="Depth"
                    type="number"
                    min="25"
                    max="150"
                    value={scene.depth}
                    disabled={running}
                    onChange={(e) => change({ depth: Number(e.target.value) })}
                  />
                  <span>m</span>
                </div>
              </label>
            </div>
            <Slider
              label="Elevation change"
              value={scene.rise}
              min={0}
              max={70}
              unit="m"
              onChange={(rise) => change({ rise })}
              disabled={running}
            />
            <Slider
              label="Terraces"
              value={scene.terraces}
              min={2}
              max={8}
              unit=""
              onChange={(terraces) => change({ terraces })}
              disabled={running}
            />
            <div className="section-label">
              <span>02</span>Planting & engineering
              <SlidersHorizontal size={13} />
            </div>
            <div className="compact-fields">
              <label>
                Tree spacing{" "}
                <div>
                  <select
                    aria-label="Tree spacing"
                    value={scene.spacing}
                    disabled={running}
                    onChange={(e) => change({ spacing: +e.target.value })}
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} m
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                Row spacing{" "}
                <div>
                  <select
                    aria-label="Row spacing"
                    value={scene.row_spacing}
                    disabled={running}
                    onChange={(e) => change({ row_spacing: +e.target.value })}
                  >
                    {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                      <option key={n} value={n}>
                        {n} m
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
            <label className="budget-input">
              Budget
              <div>
                <span>¥</span>
                <input
                  aria-label="Budget"
                  type="number"
                  min="100"
                  max="100000"
                  step="1000"
                  disabled={running}
                  value={scene.budget}
                  onChange={(e) => change({ budget: +e.target.value })}
                />
                <small>CNY</small>
              </div>
            </label>
            <Slider
              label="Minimum pressure"
              value={scene.min_pressure}
              min={0.1}
              max={0.6}
              step={0.01}
              unit="MPa"
              disabled={running}
              onChange={(min_pressure) => change({ min_pressure })}
            />
            <details className="advanced">
              <summary>
                Hydraulic settings <ChevronRight size={12} />
              </summary>
              <Slider
                label="Maximum pressure"
                value={scene.max_pressure}
                min={0.2}
                max={1.1}
                step={0.01}
                unit="MPa"
                disabled={running}
                onChange={(max_pressure) => change({ max_pressure })}
              />
              <Slider
                label="Supply flow limit"
                value={scene.source_lpm}
                min={5}
                max={500}
                step={5}
                unit="L/min"
                disabled={running}
                onChange={(source_lpm) => change({ source_lpm })}
              />
              <Slider
                label="Water per tree"
                value={scene.volume_l}
                min={1}
                max={10}
                step={0.5}
                unit="L"
                disabled={running}
                onChange={(volume_l) => change({ volume_l })}
              />
            </details>
          </div>
          <div className="setup-footer">
            <div>
              <Save size={12} />
              Plot saved locally
            </div>
            <button
              className="generate-button"
              disabled={!geom || previewing || (!ready && !running)}
              onClick={running ? cancel : start}
            >
              {running ? (
                <>
                  <Square size={14} />
                  Stop run<span>{progress}%</span>
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" />
                  Generate plans
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
        </aside>
        <section className="center-panel">
          <section className="viewport" ref={viewRef}>
            <div className="viewport-heading">
              <div>
                <span className="eyebrow">ORCHARD / DIGITAL ENVIRONMENT</span>
                <h2>
                  {scene.name}
                  <span className="scene-title-index"> / 01</span>
                </h2>
                <p>
                  {scene.width} × {scene.depth} m <i />
                  Rise {scene.rise} m<i />
                  {scene.terraces} terraces
                </p>
              </div>
              <div className="view-tools">
                <button
                  className={!pressure && !clay ? "active" : ""}
                  onClick={() => {
                    setPressure(false);
                    setClay(false);
                  }}
                >
                  <Layers3 size={14} />
                  Natural
                </button>
                <button
                  className={clay && !pressure ? "active" : ""}
                  onClick={() => {
                    setClay(true);
                    setPressure(false);
                  }}
                >
                  <Box size={14} />
                  Clay
                </button>
                <button
                  className={pressure ? "active" : ""}
                  onClick={() => setPressure(true)}
                  disabled={!selected && !activeFrame}
                >
                  <span className="heat-icon" />
                  Pressure
                </button>
                <button
                  title="Top view"
                  aria-label="Top view"
                  className={cameraMode === "top" ? "active" : ""}
                  onClick={() =>
                    setCameraMode((m) => (m === "top" ? "perspective" : "top"))
                  }
                >
                  <Scan size={14} />
                </button>
                <button
                  title="Reset view"
                  aria-label="Reset view"
                  onClick={() => setReset((n) => n + 1)}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  title="Fullscreen"
                  aria-label="Fullscreen"
                  onClick={() => {
                    if (document.fullscreenElement)
                      document.exitFullscreen().catch(() => {});
                    else
                      viewRef.current
                        ?.requestFullscreen()
                        .catch(() =>
                          notify("Fullscreen is unavailable in this browser"),
                        );
                  }}
                >
                  <Expand size={14} />
                </button>
              </div>
            </div>
            <div className="canvas-wrap">
              {geom ? (
                <Suspense
                  fallback={
                    <div className="canvas-loading">Loading 3D view…</div>
                  }
                >
                  <Scene3D
                    scene={scene}
                    geom={geom}
                    plan={selected}
                    pressure={pressure}
                    reset={reset}
                    clay={clay}
                    flow={flow}
                    solving={running}
                    replaying={replay !== null}
                    progress={progress}
                    frame={activeFrame}
                    cameraMode={cameraMode}
                  />
                </Suspense>
              ) : (
                <div className="canvas-loading">
                  {previewing ? (
                    <>
                      <LoaderCircle className="spin" size={25} />
                      <p>Building terrain…</p>
                    </>
                  ) : (
                    <>
                      <Leaf size={28} />
                      <p>Adjust parameters to restore the terrain preview</p>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="scene-flow-controls">
              <button
                className={flow ? "active" : ""}
                onClick={() => setFlow(!flow)}
                aria-label={
                  flow ? "Pause water animation" : "Play water animation"
                }
              >
                {flow ? <Pause size={13} /> : <Play size={13} />}
                <span>{flow ? "Pause flow" : "Play flow"}</span>
              </button>
              <small>Flow paths · Enlarged pipes</small>
            </div>
            <div className="map-top-caption">
              <span className="status-dot" />
              {activeFrame
                ? `${activeFrame.candidate.id} · ${activeFrame.candidate.feasible ? "Constraints met" : activeFrame.candidate.violations[0]}`
                : running || replay !== null
                  ? "Building candidate routes"
                  : selected
                    ? `${LABELS[selected.label]} · ${selected.id}`
                    : "Plot preview"}
              <span>1 : 1 elevation</span>
            </div>
            <div className="map-compass">
              <span>3D</span>
              <div>⌖</div>
              <small>Coordinates / m</small>
            </div>
            <div className="map-bottom-caption">
              {pressure && selected ? (
                <>
                  <span className="pressure-ramp" />
                  <span>
                    {scene.min_pressure.toFixed(2)} —{" "}
                    {scene.max_pressure.toFixed(2)} MPa
                  </span>
                </>
              ) : (
                <>
                  <span className="legend-pipe" />
                  Water network
                  <span className="legend-tree" />
                  Planting nodes
                </>
              )}
              <small>
                Drag to orbit · Scroll to zoom · Select a tree to inspect
              </small>
            </div>
            <div className="viewport-summary">
              <div>
                <span>Planting nodes</span>
                <b>
                  {geom?.nodes.length ?? "—"}
                  <small> trees</small>
                </b>
              </div>
              <div>
                <span>Plot area</span>
                <b>
                  {geom ? (geom.area_m2 / 10000).toFixed(2) : "—"}
                  <small> ha</small>
                </b>
              </div>
              <div>
                <span>
                  {displayPlan || activeFrame
                    ? "Minimum node pressure"
                    : "Minimum design pressure"}
                </span>
                <b>
                  {(
                    activeFrame?.candidate.min_pressure ??
                    displayPlan?.min_pressure ??
                    scene.min_pressure
                  ).toFixed(2)}
                  <small> MPa</small>
                </b>
              </div>
              <div>
                <span>
                  {displayPlan || activeFrame ? "Configuration cost" : "Budget"}
                </span>
                <b>
                  ¥
                  {money(
                    activeFrame?.candidate.cost ??
                      displayPlan?.cost ??
                      scene.budget,
                  )}
                </b>
              </div>
            </div>
          </section>
          <section className="trace-panel">
            <div className="trace-heading">
              <span>
                <span className={`status-dot ${running ? "pulsing" : ""}`} />
                Solver activity<span className="mono">ENGINE TRACE</span>
              </span>
              <div>
                <span className="solver-tag">
                  {running
                    ? "LIVE"
                    : replay !== null
                      ? "REPLAY"
                      : result
                        ? "COMPLETE"
                        : "READY"}{" "}
                  · EPANET
                </span>
                {events.length > 0 && !running && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setReplay(replay === null ? 0 : null);
                      setReplayPlaying(replay === null);
                    }}
                  >
                    <Play size={11} />
                    {replay === null ? "Replay" : "Stop replay"}
                  </button>
                )}
              </div>
            </div>
            <div className="trace-stage">
              <div className="trace-stage-icon">
                <span className="trace-number">
                  {String(traceStage + 1).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h3>
                  {replay !== null
                    ? "Replaying calculation records"
                    : latest?.data.message ||
                      "Terrain ready. Explore the possibilities."}
                </h3>
                <p>
                  {running
                    ? "Checking flow, pressure and velocity in each zone"
                    : result
                      ? `Run ${result.elapsed_s.toFixed(1)} s · Scene ${geom?.revision.slice(0, 8)}`
                      : "Trace every route, pipe, pump and zone configuration."}
                </p>
              </div>
              <div className="trace-counter">
                <b>
                  {shownCount}
                  <span> / {total}</span>
                </b>
                <small>Evaluated</small>
              </div>
              <div className="trace-counter">
                <b>{shownFeasible}</b>
                <small>Feasible</small>
              </div>
            </div>
            <div className="solver-steps">
              {["Routes", "Hydraulics", "Sensitivity", "Complete"].map(
                (label, i) => (
                  <div
                    key={label}
                    className={`${i < traceStage ? "done" : ""} ${i === traceStage ? "current" : ""}`}
                  >
                    <span>{i < traceStage ? <Check size={10} /> : i + 1}</span>
                    {label}
                    <i />
                  </div>
                ),
              )}
            </div>
            {replay !== null && (
              <div className="replay-transport">
                <button
                  aria-label="Previous step"
                  onClick={() => {
                    setReplayPlaying(false);
                    setReplay(Math.max(0, replay - 1));
                  }}
                >
                  <SkipBack size={12} />
                </button>
                <button
                  aria-label={replayPlaying ? "Pause replay" : "Resume replay"}
                  onClick={() => setReplayPlaying(!replayPlaying)}
                >
                  {replayPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <input
                  type="range"
                  aria-label="Replay progress"
                  min={0}
                  max={events.length}
                  value={replay}
                  onChange={(e) => {
                    setReplayPlaying(false);
                    setReplay(
                      +e.target.value >= events.length ? null : +e.target.value,
                    );
                  }}
                />
                <span>
                  {replay}/{events.length}
                </span>
                <button
                  aria-label="Next step"
                  onClick={() => {
                    setReplayPlaying(false);
                    setReplay(replay + 1 >= events.length ? null : replay + 1);
                  }}
                >
                  <SkipForward size={12} />
                </button>
              </div>
            )}
            <div className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <details className="trace-details">
              <summary>Calculation log</summary>
              <div className="trace-log">
                {visibleEvents.slice(-3).map((e) => (
                  <div key={e.seq}>
                    <time>
                      {new Date(e.at).toLocaleTimeString("zh-CN", {
                        hour12: false,
                      })}
                    </time>
                    <span className={`event-type type-${e.type}`}>
                      {e.type.toUpperCase()}
                    </span>
                    <span>{e.data.message}</span>
                  </div>
                ))}
                {!visibleEvents.length && (
                  <div>
                    <span className="muted">READY</span>
                    <span className="muted">
                      Run events appear here and are included in the project
                      export.
                    </span>
                  </div>
                )}
              </div>
            </details>
          </section>
          <form className="command-bar" onSubmit={submitCommand}>
            <span className="command-icon">⌘</span>
            <input
              aria-label="Parameter command"
              placeholder="Try “budget 18000” or “rise 25m”"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={running || commandBusy}
            />
            <span className="local-badge">
              <CloudOff size={11} />
              Local rules
            </span>
            <button
              aria-label="Apply command"
              type="submit"
              disabled={!command.trim() || running || commandBusy}
            >
              {commandBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowRight size={17} />
              )}
            </button>
          </form>
        </section>
        <Results
          result={replay === null ? result : undefined}
          candidates={shownCandidates}
          selected={replay === null ? selected : undefined}
          onSelect={setSelectedId}
          running={running || replay !== null}
        />
      </main>
      <footer className="statusbar">
        <span>
          <Leaf size={11} />
          DEMETER / ENGINEERING WORKSPACE
        </span>
        <span>Water hydraulics · Demo equipment catalog</span>
        <span>
          SCENE v1 <i />
          seed {scene.seed}
        </span>
      </footer>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Quick guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close guide"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A FIELD, REIMAGINED</span>
            <h2>From a field to a plan.</h2>
            <p>
              1. Edit the boundary, place a water source and draw exclusions.
              Set the plot dimensions, elevation and budget. Exclusions prevent
              both planting and pipe routing.
            </p>
            <p>
              2. Generate plans to evaluate 2 routes × 3 main sizes × 2 lateral
              sizes × 3 pumps × 3 zone counts: 108 configurations. EPANET 2.2
              evaluates each zone independently.
            </p>
            <p>
              3. Compare cost and duration, switch plans or inspect pressure.
              Select a tree to see emitter pressure and flow. Export the scene,
              materials and calculation records.
            </p>
            <div className="help-note">
              <b>Model scope</b>
              <p>
                Synthetic pump curves and clean-water emitters. Pipes follow the
                terrain at a 1.5 m offset, with independent node valves. Cycle
                times include 45 seconds per zone change and three minutes for
                preparation and flushing.
              </p>
              <p>
                Twelve perturbation scenarios check sensitivity. The command
                field supports one budget or rise adjustment at a time.
              </p>
            </div>
            <button className="generate-button" onClick={() => setHelp(false)}>
              Start designing
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
