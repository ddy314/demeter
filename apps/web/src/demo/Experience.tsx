import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  Sun,
  Mountain,
  Warehouse,
  Route,
  Droplets,
  ChartNoAxesCombined,
  Check,
  BookOpen,
  X,
  Download,
  SlidersHorizontal,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import {
  api,
  download,
  money,
  type Geometry,
  type Plan,
  type Result,
  type RunEvent,
  type SolverFrame,
} from "../types";
import { PRESETS } from "./presets";
import { BUILD_DURATION, BUILD_STEPS } from "./timeline";
import { calculateEconomics } from "./finance";
import type {
  Study,
  Shot,
  DemoScene,
  DesignResponse,
  DesignTrace,
} from "./types";
import "./experience.css";
const Scene3D = lazy(() => import("../Scene3D"));
const CHAPTERS = [
  { id: "terrain", name: "Terrain", icon: Mountain },
  { id: "light", name: "Sunlight", icon: Sun },
  { id: "greenhouse", name: "Structures", icon: Warehouse },
  { id: "water", name: "Irrigation", icon: Droplets },
  { id: "drone", name: "Drone", icon: Route },
  { id: "economics", name: "Economics", icon: ChartNoAxesCombined },
];
const SOURCES = [
  [
    "Greenhouse light distribution",
    "Teitel et al. · Light Distribution in Multispan Gutter-Connected Greenhouses (2012)",
    "https://www.sciencedirect.com/science/article/abs/pii/S153751101200116X",
  ],
  [
    "Light and yield",
    "Marcelis et al. · Quantification of the Growth Response to Light Quantity (2006)",
    "https://doi.org/10.17660/ActaHortic.2006.711.9",
  ],
  [
    "Solar position",
    "Reda & Andreas · Solar Position Algorithm (2004 / 2008)",
    "https://midcdmz.nlr.gov/spa/",
  ],
  [
    "Solar position equations",
    "NOAA · General Solar Position Calculations",
    "https://gml.noaa.gov/grad/solcalc/solareqns.PDF",
  ],
  [
    "Greenhouse light environment",
    "FAO · Good Agricultural Practices for Greenhouse Vegetable Crops (2013)",
    "https://www.fao.org/4/i3284e/i3284e.pdf",
  ],
  [
    "Coverage paths",
    "Choset & Pignon · Boustrophedon Cellular Decomposition (1997)",
    "https://www.ri.cmu.edu/pub_files/pub4/choset_howie_1997_3/choset_howie_1997_3.pdf",
  ],
  [
    "Spraying paths",
    "Path Planning for Spot Spraying with UAVs Combining TSP and Area Coverages (2024)",
    "https://arxiv.org/abs/2408.08001",
  ],
  [
    "Spraying operations",
    "A Review of Drone Technology and Operation Processes in Agricultural Crop Spraying (2024)",
    "https://www.mdpi.com/2504-446X/8/11/674",
  ],
  [
    "Facility economics",
    "Economic Feasibility Analysis of Greenhouse–Fuel Cell Convergence Systems (2024)",
    "https://www.mdpi.com/2071-1050/16/1/74",
  ],
];
export default function Experience({
  onWorkbench,
}: {
  onWorkbench: () => void;
}) {
  const [presetId, setPresetId] = useState("glass");
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [scene, setScene] = useState(preset.scene);
  const [inputs, setInputs] = useState(preset.inputs);
  const [prompt, setPrompt] = useState(preset.prompt);
  const [planning, setPlanning] = useState(false);
  const [designTrace, setDesignTrace] = useState<DesignTrace>();
  const [providerLabel, setProviderLabel] = useState("Connecting");
  const [geometryScene, setGeometryScene] = useState(scene);
  const [geom, setGeom] = useState<Geometry>(),
    [study, setStudy] = useState<Study>(),
    [plan, setPlan] = useState<Plan>(),
    [result, setResult] = useState<Result>(),
    [frame, setFrame] = useState<SolverFrame>();
  const [phase, setPhase] = useState<
      "prompt" | "building" | "tour" | "finished"
    >("prompt"),
    [elapsed, setElapsed] = useState(0),
    [chapter, setChapter] = useState(0),
    [chapterTime, setChapterTime] = useState(0),
    [playing, setPlaying] = useState(true),
    [buildKey, setBuildKey] = useState(0);
  const [evaluated, setEvaluated] = useState(0),
    [error, setError] = useState(""),
    [docs, setDocs] = useState(false),
    [clay, setClay] = useState(true),
    [sunHour, setSunHour] = useState(14),
    [price, setPrice] = useState(preset.inputs.price_kg),
    [yieldValue, setYieldValue] = useState(preset.inputs.yield_kg_tree);
  const stream = useRef<EventSource | null>(null),
    abort = useRef<AbortController | null>(null),
    runId = useRef(""),
    generation = useRef(0),
    eventLog = useRef<RunEvent[]>([]);
  const cancel = () => {
    generation.current++;
    setPlanning(false);
    abort.current?.abort();
    stream.current?.close();
    stream.current = null;
    if (runId.current) {
      api(`/runs/${runId.current}/cancel`, {}).catch(() => {});
      runId.current = "";
    }
  };
  useEffect(() => {
    if (geom && geometryScene === scene) return;
    const controller = new AbortController();
    setError("");
    api<Geometry>("/preview", scene, controller.signal)
      .then((g) => {
        setGeom(g);
        setGeometryScene(scene);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [scene]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ label: string }>("/design/config", undefined, controller.signal)
      .then((config) => setProviderLabel(config.label))
      .catch(() => setProviderLabel("Service unavailable"));
    return () => controller.abort();
  }, []);
  useEffect(() => () => cancel(), []);
  useEffect(() => {
    if (!playing || phase !== "building") return;
    const t = setInterval(
      () => setElapsed((e) => Math.min(BUILD_DURATION, e + 0.1)),
      100,
    );
    return () => clearInterval(t);
  }, [playing, phase]);
  useEffect(() => {
    if (
      phase === "building" &&
      elapsed >= BUILD_DURATION &&
      study &&
      plan &&
      playing
    ) {
      setPhase("tour");
      setChapter(0);
      setChapterTime(0);
    }
  }, [elapsed, phase, study, plan, playing]);
  useEffect(() => {
    if (!playing || phase !== "tour") return;
    const t = setInterval(() => setChapterTime((t) => t + 0.1), 100);
    return () => clearInterval(t);
  }, [playing, phase, chapter]);
  useEffect(() => {
    if (chapterTime < 9) return;
    if (chapter < 5) {
      setChapter((c) => c + 1);
      setChapterTime(0);
    } else {
      setPhase("finished");
      setPlaying(false);
    }
  }, [chapterTime, chapter]);
  const begin = async () => {
    if (planning || !prompt.trim()) return;
    cancel();
    const token = generation.current,
      controller = new AbortController();
    abort.current = controller;
    setError("");
    setPlanning(true);
    setDesignTrace(undefined);
    const timeout = window.setTimeout(() => {
      if (token === generation.current) {
        setError("Design request timed out. Try again.");
        controller.abort();
      }
    }, 60000);
    try {
      const design = await api<DesignResponse>(
        "/design",
        { prompt, scene, inputs },
        controller.signal,
      );
      window.clearTimeout(timeout);
      if (token !== generation.current) return;
      if (design.status === "clarification") {
        setError(design.question);
        return;
      }
      const resolvedScene = design.scene;
      const resolvedGeom = design.geometry;
      setScene(resolvedScene);
      setInputs(design.inputs);
      setGeom(resolvedGeom);
      setGeometryScene(resolvedScene);
      setDesignTrace(design.trace);
      setProviderLabel(
        design.trace.provider === "mock" ? "Local simulator" : "Nebius",
      );
      setPlanning(false);
      eventLog.current = [];
      setStudy(undefined);
      setPlan(undefined);
      setResult(undefined);
      setFrame(undefined);
      setEvaluated(0);
      setElapsed(0);
      setChapter(0);
      setChapterTime(0);
      setPlaying(true);
      setBuildKey((k) => k + 1);
      setPhase("building");
      setPrice(design.inputs.price_kg);
      setYieldValue(design.inputs.yield_kg_tree);
      api<Study>(
        "/study",
        { scene: resolvedScene, inputs: design.inputs },
        controller.signal,
      )
        .then((s) => {
          if (token === generation.current) setStudy(s);
        })
        .catch((e) => {
          if (e.name !== "AbortError" && token === generation.current) {
            setError(e.message);
            setPlaying(false);
          }
        });
      const run = await api<{ run_id: string }>(
        "/runs",
        resolvedScene,
        controller.signal,
      );
      if (token !== generation.current) {
        api(`/runs/${run.run_id}/cancel`, {}).catch(() => {});
        return;
      }
      runId.current = run.run_id;
      const es = new EventSource(`/api/runs/${run.run_id}/events`);
      stream.current = es;
      es.onmessage = (m) => {
        if (token !== generation.current) return;
        const e = JSON.parse(m.data) as RunEvent;
        eventLog.current.push(e);
        if (e.type === "search") {
          setEvaluated(Number(e.data.evaluated));
          const data = e.data as any;
          if (data.visual)
            setFrame({
              candidate: data.latest,
              pressures: data.visual.pressures,
              outflows_lpm: data.visual.outflows_lpm,
              edges: resolvedGeom.routes?.[data.latest.layout] || [],
              seq: e.seq,
            });
        }
        if (e.type === "complete") {
          const r = e.data as unknown as Result;
          setResult(r);
          setPlan(r.plans?.find((p) => p.label === "balanced") || r.plans?.[0]);
          setFrame(undefined);
          es.close();
          runId.current = "";
          if (!r.plans?.length) {
            setError(
              r.message || "No feasible irrigation plan for this scene.",
            );
            setPlaying(false);
          }
        }
        if (e.type === "error" || e.type === "cancelled") {
          setError(e.data.message);
          setPlaying(false);
          es.close();
          runId.current = "";
        }
      };
      es.onerror = () => {
        if (token === generation.current) {
          setError("Connection lost. Return to the prompt and try again.");
          setPlaying(false);
          es.close();
        }
      };
    } catch (e) {
      if (token === generation.current && (e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setPlaying(false);
      }
    } finally {
      window.clearTimeout(timeout);
      if (token === generation.current) setPlanning(false);
    }
  };
  const returnPrompt = () => {
    cancel();
    setPhase("prompt");
    setElapsed(0);
    setChapter(0);
    setChapterTime(0);
    setStudy(undefined);
    setPlan(undefined);
    setResult(undefined);
    setFrame(undefined);
    setPlaying(true);
    setError("");
  };
  const buildStep = BUILD_STEPS.reduce(
    (current, s, i) => (elapsed >= s.at ? i : current),
    0,
  );
  const stage =
    phase === "prompt" ? 3 : phase === "building" ? buildStep + 1 : 6;
  const id =
    phase === "building"
      ? ["terrain", "trees", "greenhouse", "water", "overview"][buildStep]
      : CHAPTERS[chapter].id;
  const shot = useMemo<Shot>(() => {
    let target: [number, number, number] = [0, scene.rise * 0.4, 0],
      offset: [number, number, number] = [92, 83, 118];
    if (phase === "prompt") offset = [100, 95, 140];
    else if (id === "terrain") offset = [-85, 65, 115];
    else if (id === "trees") offset = [65, 72, 110];
    else if (id === "light") {
      target = [0, scene.rise * 0.45, 0];
      offset = [62, 90, 108];
    } else if (id === "greenhouse") {
      const g = study?.greenhouses[0];
      if (g) {
        target = [g.x - scene.width / 2, g.z + 2, scene.depth / 2 - g.y];
        offset = phase === "building" ? [65, 49, 80] : [33, 26, 45];
        if (phase === "building") {
          const sites = study!.greenhouses;
          target = [
            sites.reduce((v, s) => v + s.x, 0) / sites.length - scene.width / 2,
            g.z + 2,
            scene.depth / 2 - sites.reduce((v, s) => v + s.y, 0) / sites.length,
          ];
        }
      } else if (geom) {
        target = [
          geom.source.x - scene.width / 2,
          geom.source.z + 2,
          scene.depth / 2 - geom.source.y,
        ];
        offset = [30, 24, 38];
      }
    } else if (id === "water" && geom) {
      target = [
        geom.source.x - scene.width / 2,
        geom.source.z + 3,
        scene.depth / 2 - geom.source.y,
      ];
      offset = phase === "building" ? [90, 95, 125] : [39, 32, 52];
      if (phase === "building") target = [0, scene.rise * 0.4, 0];
    } else if (id === "drone") {
      target = [0, scene.rise * 0.6 + 10, 0];
      offset = [65, 80, -105];
    } else if (id === "economics") offset = [95, 80, 125];
    const detailed =
      id === "greenhouse" || (id === "water" && phase !== "building");
    if (!detailed)
      offset = offset.map(
        (v) => v * Math.max(scene.width / 120, scene.depth / 70),
      ) as [number, number, number];
    return {
      target,
      position: target.map((v, i) => v + offset[i]) as [number, number, number],
      key: `${phase}-${id}-${buildKey}`,
    };
  }, [scene, id, phase, study?.greenhouses, geom, buildKey]);
  const demo = useMemo<DemoScene>(
    () => ({
      stage,
      building: phase === "building",
      buildTime: elapsed,
      study,
      chapter: phase === "prompt" ? "terrain" : id,
      playing,
      sunHour,
      shot,
      buildKey,
    }),
    [stage, phase, elapsed, study, id, playing, sunHour, shot, buildKey],
  );
  const economics = useMemo(() => {
    if (!study || !plan) return null;
    return calculateEconomics(study, plan.cost, price, yieldValue);
  }, [study, plan, price, yieldValue]);
  const narration = [
    {
      eyebrow: "01 / LAND & STRUCTURE",
      title: "Designed for\nthe hillside.",
      value: ((geom?.plantable_area_m2 || 0) / 10000).toFixed(2),
      unit: "ha",
      label: "Plantable area",
    },
    {
      eyebrow: "02 / SUNLIGHT",
      title: "Follow the light.",
      value: study?.light.mean_hours.toFixed(1) || "—",
      unit: "h",
      label: "Mean direct sunlight · Clear sky",
    },
    {
      eyebrow: "03 / PROTECTED GROWING",
      title: study?.greenhouses.length
        ? "Space to grow."
        : "Everything\nin its place.",
      value: String(study?.greenhouses.length || 3),
      unit: study?.greenhouses.length ? "houses" : "systems",
      label: study?.greenhouses.length
        ? "Greenhouses"
        : "Storage · Solar · Monitoring",
    },
    {
      eyebrow: "04 / WATER NETWORK",
      title: "Water for\nevery tree.",
      value: plan?.min_pressure.toFixed(2) || "—",
      unit: "MPa",
      label: "Minimum active node pressure",
    },
    {
      eyebrow: "05 / AERIAL OPERATIONS",
      title: "A path across\nthe field.",
      value: study?.drone.coverage_pct.toFixed(1) || "—",
      unit: "%",
      label: "Coverage of accessible area",
    },
    {
      eyebrow: "06 / FARM ECONOMICS",
      title: "Make the\nnumbers count.",
      value: economics ? money(economics.net) : "—",
      unit: "CNY / year",
      label: "Estimated annual net cash flow",
    },
  ];
  const current = narration[chapter];
  const selectChapter = (i: number) => {
    setChapter(i);
    setChapterTime(0);
    setPhase("tour");
    setPlaying(false);
  };
  const exportDemo = () =>
    download(`demeter-${preset.id}-study.json`, {
      preset: preset.id,
      prompt: designTrace?.prompt ?? prompt,
      design: designTrace,
      scene,
      study,
      hydraulics: result,
      economics,
      price_kg: price,
      yield_kg_tree: yieldValue,
      discount_rate: 0.08,
      events: eventLog.current,
      visual_facilities: {
        storage_tanks: 2,
        solar_panels: 6,
        monitoring_units: 1,
        included_in_economics: false,
      },
    });
  return (
    <div
      className={`experience phase-${phase}`}
      data-phase={phase}
      data-chapter={id}
    >
      <header className="experience-header">
        <a className="experience-brand" href="/">
          d<span>demeter</span>
          <small>FIELD NOTES / 01</small>
        </a>
        <div className="experience-header-actions">
          <span className="local-pill">
            <i />
            Interactive demo
          </span>
          <button
            onClick={() => {
              cancel();
              onWorkbench();
            }}
          >
            <SlidersHorizontal size={14} />
            Workbench
            <ArrowUpRight size={13} />
          </button>
          <button
            aria-label="Research & assumptions"
            onClick={() => {
              setDocs(true);
              setPlaying(false);
            }}
          >
            <BookOpen size={17} />
          </button>
        </div>
      </header>
      <main className="experience-stage">
        <div className="experience-canvas">
          {geom ? (
            <Suspense
              fallback={
                <div className="experience-loading">
                  Preparing the 3D studio…
                </div>
              }
            >
              <Scene3D
                scene={geometryScene}
                geom={geom}
                plan={stage >= 4 ? plan : undefined}
                frame={stage >= 4 ? frame : undefined}
                pressure={id === "water" && phase !== "building"}
                reset={0}
                clay={clay}
                flow={playing}
                solving={phase === "building" && !plan && stage >= 4}
                replaying={false}
                progress={(evaluated / 108) * 100}
                cameraMode="perspective"
                demo={demo}
              />
            </Suspense>
          ) : (
            <div className="experience-loading">Preparing the terrain…</div>
          )}
        </div>
        <div className="experience-topline">
          <span>
            {scene.name} <i>/</i> {scene.width} × {scene.depth} m
          </span>
          <div>
            <button
              className={!clay ? "active" : ""}
              onClick={() => setClay(false)}
            >
              Natural
            </button>
            <button
              className={clay ? "active" : ""}
              onClick={() => setClay(true)}
            >
              Clay
            </button>
          </div>
        </div>
        <div className="north-marker">
          N<span>↑</span>
        </div>
        {phase === "prompt" ? (
          <section className="prompt-intro">
            <span className="editorial-eyebrow">A FIELD OF POSSIBILITIES</span>
            <h1>
              Start with an idea.
              <br />
              <span>Watch it grow.</span>
            </h1>
            <p>
              From land and light to a year of harvest.
              <br />
              One prompt. Your next orchard.
            </p>
            <div className="intro-tags">
              <span>
                <Sun size={13} />
                Sunlight
              </span>
              <span>
                <Warehouse size={13} />
                Greenhouses
              </span>
              <span>
                <Route size={13} />
                Drone
              </span>
              <span>
                <ChartNoAxesCombined size={13} />
                Economics
              </span>
            </div>
          </section>
        ) : phase === "building" ? (
          <section className="building-story">
            <span className="editorial-eyebrow">
              {BUILD_STEPS[buildStep].code}
            </span>
            <h1>{BUILD_STEPS[buildStep].title}</h1>
            <p>
              {buildStep === 2 && !study?.greenhouses.length
                ? "Assemble storage, solar panels and monitoring equipment."
                : BUILD_STEPS[buildStep].detail}
            </p>
            <div className="assembly-count">
              <strong>
                {String(
                  Math.min(100, Math.round((elapsed / BUILD_DURATION) * 100)),
                ).padStart(2, "0")}
              </strong>
              <span>
                %<small>Assembled</small>
              </span>
            </div>
          </section>
        ) : (
          <section className="tour-story" key={chapter}>
            <span className="editorial-eyebrow">{current.eyebrow}</span>
            <h1>{current.title}</h1>
            <p>
              {
                [
                  `${scene.terraces} terraces. ${geom?.nodes.length || 0} planting nodes. An orchard shaped by the contours.`,
                  `Trace the sun across the terraces. Move the time slider to change the light.`,
                  study?.greenhouses.length
                    ? `${study.greenhouses.length} greenhouses. ${study.greenhouses.reduce((a, g) => a + g.area_m2, 0).toFixed(0)} m² of protected growing space, enclosed by arches and a translucent roof.`
                    : "Water storage, a solar canopy and field sensors support the orchard.",
                  "From the source to the mains and branches. Follow the water to every tree.",
                  "Follow sweeping flight paths through the orchard, routing around the structures.",
                  "Compare investment and annual returns. Adjust price and yield to explore cash flow.",
                ][chapter]
              }
            </p>
            <div className="story-metric">
              <strong>{current.value}</strong>
              <span>{current.unit}</span>
              <small>{current.label}</small>
            </div>

            {id === "light" && (
              <label className="sun-slider">
                Solar time{" "}
                <b>
                  {Math.floor(sunHour).toString().padStart(2, "0")}:
                  {sunHour % 1 ? "30" : "00"}
                </b>
                <input
                  aria-label="Solar time"
                  type="range"
                  min={7}
                  max={17}
                  step={0.5}
                  value={sunHour}
                  onChange={(e) => {
                    setSunHour(+e.target.value);
                    setPlaying(false);
                  }}
                />
                <span>
                  07:00
                  <Sun size={12} />
                  17:00
                </span>
              </label>
            )}
            {id === "economics" && economics && (
              <div className="economics-controls">
                <label>
                  Sale price{" "}
                  <input
                    aria-label="Sale price"
                    type="number"
                    min={0.1}
                    max={100}
                    step={0.5}
                    value={price}
                    onChange={(e) => {
                      setPrice(Math.min(100, Math.max(0.1, +e.target.value)));
                      setPlaying(false);
                    }}
                  />{" "}
                  CNY/kg
                </label>
                <label>
                  Yield per tree{" "}
                  <input
                    aria-label="Yield per tree"
                    type="number"
                    min={1}
                    max={200}
                    value={yieldValue}
                    onChange={(e) => {
                      setYieldValue(
                        Math.min(200, Math.max(1, +e.target.value)),
                      );
                      setPlaying(false);
                    }}
                  />{" "}
                  kg
                </label>
                <div className="cashflow">
                  {economics.cashflow.map((v, i) => (
                    <div
                      key={i}
                      title={`Year ${i} cumulative cash flow: CNY ${money(v)}`}
                      aria-label={`Year ${i} cumulative cash flow: CNY ${v.toFixed(0)}`}
                    >
                      <span
                        className={v < 0 ? "negative" : ""}
                        style={{
                          height: `${Math.max(3, (Math.abs(v) / Math.max(...economics.cashflow.map(Math.abs), 1)) * 25)}px`,
                        }}
                      />
                      <small>{i === 0 ? "Initial" : `Y${i}`}</small>
                    </div>
                  ))}
                </div>
                <p>
                  5-year NPV · 8% discount rate<b>¥{money(economics.npv)}</b>
                </p>
              </div>
            )}
          </section>
        )}
      </main>
      {error && (
        <div className="demo-error" role="alert">
          {error}
          <button onClick={returnPrompt}>Back to retry</button>
        </div>
      )}
      {phase === "prompt" ? (
        <footer className="prompt-dock">
          <div className="preset-choices">
            {PRESETS.map((p, i) => (
              <button
                key={p.id}
                className={preset.id === p.id ? "active" : ""}
                onClick={() => {
                  cancel();
                  setError("");
                  setPresetId(p.id);
                  setScene(p.scene);
                  setInputs(p.inputs);
                  setPrompt(p.prompt);
                  setDesignTrace(undefined);
                  setPrice(p.inputs.price_kg);
                  setYieldValue(p.inputs.yield_kg_tree);
                }}
              >
                <span>0{i + 1}</span>
                <div>
                  <b>{p.title}</b>
                  <small>{p.subtitle}</small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
          <div className="prompt-composer">
            <Sparkles size={19} />
            <textarea
              aria-label="Demo prompt"
              value={prompt}
              maxLength={4000}
              disabled={planning}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void begin();
                }
              }}
            />
            <button
              className="start-demo"
              disabled={planning || !prompt.trim()}
              onClick={begin}
              aria-label="Start demo"
            >
              {planning ? (
                <LoaderCircle className="model-spinner" size={22} />
              ) : (
                <ArrowUp size={22} />
              )}
            </button>
          </div>
          <div className="composer-caption" aria-live="polite">
            <span>
              {planning ? "Interpreting your design…" : providerLabel}
            </span>
            {planning ? (
              <button onClick={cancel}>Cancel</button>
            ) : (
              <button
                onClick={() => {
                  setPrompt(
                    "Plan a 160 x 90 m orchard; rise 12 m; budget 40k; two greenhouses; winter; swath 4 m.",
                  );
                  setError("");
                }}
              >
                Try a custom plan <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        </footer>
      ) : (
        <footer className="tour-dock">
          <div className="tour-controls">
            <button onClick={returnPrompt} aria-label="Back to prompts">
              <ArrowLeft size={17} />
            </button>
            <button
              className="tour-play"
              aria-label={
                phase === "building"
                  ? playing
                    ? "Pause assembly"
                    : "Play assembly"
                  : playing
                    ? "Pause tour"
                    : "Play tour"
              }
              onClick={() => {
                if (phase === "finished") {
                  setPhase("tour");
                  setChapter(0);
                  setChapterTime(0);
                }
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <div>
              <b>
                {phase === "building"
                  ? BUILD_STEPS[buildStep].name
                  : phase === "finished"
                    ? "Your orchard is ready to explore."
                    : CHAPTERS[chapter].name}
              </b>
              <small>
                {phase === "building"
                  ? `${Math.min(100, Math.round((elapsed / BUILD_DURATION) * 100))}% assembled`
                  : playing
                    ? "Auto tour"
                    : "Paused"}
              </small>
            </div>
            <div className="tour-spacer" />
            {phase !== "building" && (
              <>
                <button
                  className="rebuild-button"
                  onClick={() => {
                    setElapsed(0);
                    setPhase("building");
                    setPlaying(true);
                    setBuildKey((k) => k + 1);
                  }}
                >
                  <RotateCcw size={14} />
                  Replay assembly
                </button>
                <button
                  aria-label="Replay tour"
                  onClick={() => {
                    setChapter(0);
                    setChapterTime(0);
                    setPhase("tour");
                    setPlaying(true);
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <button aria-label="Export study" onClick={exportDemo}>
                  <Download size={16} />
                </button>
                <button
                  aria-label="Next chapter"
                  disabled={chapter === 5}
                  onClick={() => selectChapter(chapter + 1)}
                >
                  <ChevronRight size={19} />
                </button>
              </>
            )}
          </div>
          {phase === "building" ? (
            <div className="assembly-timeline">
              <input
                aria-label="Assembly time"
                type="range"
                min={0}
                max={BUILD_DURATION}
                step={0.1}
                value={Math.min(elapsed, BUILD_DURATION)}
                onChange={(e) => {
                  setElapsed(+e.target.value);
                  setPlaying(false);
                }}
              />
              <div>
                {BUILD_STEPS.map((s, i) => (
                  <button
                    key={s.name}
                    className={i === buildStep ? "active" : ""}
                    onClick={() => {
                      setElapsed(s.at);
                      setPlaying(false);
                    }}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chapter-track">
              {CHAPTERS.map((c, i) => (
                <button
                  key={c.id}
                  className={chapter === i ? "active" : ""}
                  onClick={() => selectChapter(i)}
                >
                  <c.icon size={15} />
                  <span>{c.name}</span>
                  <i
                    style={{
                      transform: `scaleX(${i < chapter ? 1 : i === chapter ? chapterTime / 9 : 0})`,
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </footer>
      )}
      {docs && (
        <div className="study-modal-backdrop" onClick={() => setDocs(false)}>
          <section
            className="study-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Research & assumptions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-study"
              aria-label="Close research"
              onClick={() => setDocs(false)}
            >
              <X size={20} />
            </button>
            <span className="editorial-eyebrow">RESEARCH & ASSUMPTIONS</span>
            <h2>The thinking behind the field.</h2>
            <p>
              EPANET performs steady-state hydraulic calculations. The other
              modules use reproducible geometry and scenario calculations.
              Default values are demo assumptions, not site-specific
              measurements from the cited research.
            </p>
            <p>
              Storage tanks, the solar canopy and sensors are visual components,
              excluded from current cost and energy calculations.
            </p>
            <h3>Model scope</h3>
            <ul>
              {(
                study?.assumptions || [
                  "Sunlight: solar position and terrain shading; excludes clouds, canopy shading and weather data.",
                  "Structures: boundary and ground-level checks; excludes structural, climate and ventilation design.",
                  "Drone: geometric coverage paths; no deposition model or executable flight mission.",
                  "Economics: assumed revenue and costs for a mature orchard, rather than a calibrated forecast.",
                ]
              ).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {study && (
              <dl className="assumption-grid">
                <div>
                  <dt>Greenhouse unit cost</dt>
                  <dd>¥{study.inputs.greenhouse_cost_m2}/m²</dd>
                </div>
                <div>
                  <dt>Annual operating cost</dt>
                  <dd>¥{study.inputs.operating_cost_tree}/tree</dd>
                </div>
                <div>
                  <dt>Protected yield factor</dt>
                  <dd>{study.inputs.protected_yield_factor}× (assumed)</dd>
                </div>
                <div>
                  <dt>Drone service</dt>
                  <dd>
                    ¥{(study.inputs.drone_service_mu * 15).toFixed(0)}/ha ·{" "}
                    {study.inputs.annual_operations} operations/year
                  </dd>
                </div>
                <div>
                  <dt>Annual maintenance</dt>
                  <dd>4% of initial investment</dd>
                </div>
                <div>
                  <dt>Discount rate / horizon</dt>
                  <dd>8% / 5 years</dd>
                </div>
              </dl>
            )}
            <h3>Methods & research</h3>
            {SOURCES.map(([tag, title, url]) => (
              <a
                className="research-link"
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                <small>{tag}</small>
                <span>{title}</span>
                <ArrowUpRight size={15} />
              </a>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
