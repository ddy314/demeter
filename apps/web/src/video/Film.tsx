import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useThree, useFrame } from "@react-three/fiber";
import Scene3D from "../Scene3D";
import type { Scene, Geometry, Plan, Result, SolverFrame } from "../types";
import type { Study, DemoScene, Shot } from "../demo/types";
import { calculateEconomics } from "../demo/finance";
import story from "../../../../scripts/video/story.json";
import "./film.css";

type Bundle = {
  scene: Scene;
  geom: Geometry;
  study: Study;
  plan: Plan;
  result: Result;
  events: any[];
};
type FilmData = {
  custom: Bundle;
  mountain: Bundle;
  prompt: string;
  trace: any;
};
declare global {
  interface Window {
    renderFilm?: (time: number) => Promise<void>;
    filmAdvance?: (time: number) => void;
    filmReady?: boolean;
  }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function Driver({ shot }: { shot: Shot }) {
  const state = useThree();
  useFrame(() => {
    state.camera.position.set(...shot.position);
    state.camera.lookAt(...shot.target);
    state.camera.updateMatrixWorld();
  }, -2);
  useEffect(() => {
    state.gl.shadowMap.autoUpdate = true;
    window.filmAdvance = (t) => {
      state.advance(t, true);
    };
    window.filmReady = true;
    return () => {
      window.filmReady = false;
    };
  }, [state]);
  return null;
}
function Film({ data }: { data: FilmData }) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    window.renderFilm = async (t) => {
      flushSync(() => setTime(t));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      window.filmAdvance?.(t);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      window.filmAdvance?.(t);
    };
  }, []);
  const chapter =
    story.find((x) => time >= x.start && time < x.end) || story.at(-1)!;
  const u = (time - chapter.start) / (chapter.end - chapter.start);
  const part = chapter.id;
  const d = time < 20 || time >= 156 ? data.mountain : data.custom;
  const { scene, geom, study, plan } = d;
  const build = part === "build";
  const buildTime = build ? time - 36 : 100;
  const center: [number, number, number] = [0, scene.rise * 0.42, 0];
  let target: [number, number, number] = center;
  let offset = [lerp(145, 110, smooth(u)), 112, 156];
  let visual = "terrain";
  if (part === "intro" || part === "outro")
    offset = [lerp(140, 100, u), 112, lerp(170, 185, u)];
  if (part === "problem") offset = [lerp(-130, -100, u), 105, 166];
  if (part === "prompt" || part === "architecture") offset = [130, 100, 152];
  if (build) {
    const z = smooth(buildTime / 26);
    offset = [lerp(145, 100, z), lerp(118, 94, z), lerp(176, 150, z)];
    visual =
      buildTime < 10 ? "terrain" : buildTime < 17 ? "greenhouse" : "water";
  }
  if (part === "structures") {
    const g = study.greenhouses[0];
    target = [g.x - scene.width / 2, g.z + 2, scene.depth / 2 - g.y];
    offset = [lerp(51, 37, u), lerp(35, 29, u), lerp(48, 60, u)];
    visual = "greenhouse";
  }
  if (part === "light") {
    offset = [100, 126, 152];
    visual = "light";
  }
  if (part === "water") {
    offset = [lerp(-110, -85, u), 112, 143];
    visual = "water";
  }
  if (part === "drone") {
    target = [0, scene.rise * 0.6 + 8, 0];
    offset = [lerp(98, 65, u), 112, -151];
    visual = "drone";
  }
  if (part === "economics") {
    offset = [130, 102, 156];
    visual = "economics";
  }
  const shot: Shot = {
    position: offset.map((v, i) => v + target[i]) as [number, number, number],
    target,
    key: "film",
  };
  const demo: DemoScene = {
    stage: build
      ? buildTime < 5
        ? 1
        : buildTime < 10
          ? 2
          : buildTime < 17
            ? 3
            : 4
      : 6,
    building: build,
    buildTime,
    study,
    chapter: visual,
    playing: false,
    sunHour: part === "light" ? lerp(8, 16, u) : 14,
    shot,
    buildKey: 0,
    renderTime: Math.max(0, time - 111),
  };
  const searches = d.events.filter((e) => e.type === "search");
  const event =
    part === "water" && u < 0.55
      ? searches[
          Math.min(
            searches.length - 1,
            Math.floor((u / 0.55) * searches.length),
          )
        ]
      : null;
  const frame: SolverFrame | undefined = event?.data.visual
    ? {
        candidate: event.data.latest,
        pressures: event.data.visual.pressures,
        outflows_lpm: event.data.visual.outflows_lpm,
        edges: geom.routes?.[event.data.latest.layout] || [],
        seq: 1,
      }
    : undefined;
  const economic = calculateEconomics(
    study,
    plan.cost,
    study.inputs.price_kg,
    study.inputs.yield_kg_tree,
  );
  const metric = (n: number) => Math.round(n).toLocaleString("en-US");
  let metrics: [string, string][] = [];
  if (part === "problem")
    metrics = [
      ["32 m", "ELEVATION CHANGE"],
      ["244", "PLANTING NODES"],
    ];
  if (part === "build")
    metrics = [
      [
        String(Math.floor(Math.min(100, (buildTime / 26) * 100))).padStart(
          2,
          "0",
        ) + "%",
        "ASSEMBLED",
      ],
      [
        buildTime < 5
          ? "Terrain"
          : buildTime < 10
            ? "Planting"
            : buildTime < 17
              ? "Structures"
              : buildTime < 23
                ? "Network"
                : "Ready",
        "BUILD STAGE",
      ],
    ];
  if (part === "structures")
    metrics = [
      ["02", "GREENHOUSES"],
      ["360 m²", "PROTECTED FOOTPRINT"],
    ];
  if (part === "light")
    metrics = [
      [study.light.mean_hours.toFixed(1) + " h", "MEAN DIRECT SUN"],
      [
        Math.floor(demo.sunHour).toString().padStart(2, "0") +
          ":" +
          Math.floor((demo.sunHour % 1) * 60)
            .toString()
            .padStart(2, "0"),
        "LOCAL SOLAR TIME",
      ],
    ];
  if (part === "water")
    metrics = [
      [event ? String(event.data.evaluated) : "108", "CONFIGURATIONS CHECKED"],
      ["58", "FEASIBLE DESIGNS"],
    ];
  if (part === "drone")
    metrics = [
      [study.drone.coverage_pct + "%", "GEOMETRIC COVERAGE"],
      ["4 m", "WORKING SWATH"],
    ];
  if (part === "economics")
    metrics = [
      [metric(economic.net), "CNY / YEAR · NET CASH FLOW"],
      [metric(economic.npv), "CNY · FIVE-YEAR NPV"],
    ];
  const fade = Math.min(
    1,
    (time - chapter.start) / 0.55,
    (chapter.end - time) / 0.4,
  );
  return (
    <div className="film">
      <div className="world">
        <Scene3D
          scene={scene}
          geom={geom}
          plan={plan}
          frame={frame}
          pressure={part === "water"}
          reset={0}
          clay={part !== "intro" && part !== "problem" && part !== "outro"}
          flow={part === "water"}
          solving={!!frame}
          replaying={!!frame}
          progress={event ? event.data.evaluated / 108 : 1}
          cameraMode="perspective"
          demo={demo}
          renderDriver={<Driver shot={shot} />}
        />
      </div>
      <div className="left-wash" />
      <header>
        <div className="brand">
          <b>d</b> demeter
        </div>
        <span>SPATIAL ORCHARD STUDIO</span>
      </header>
      <section
        className="story"
        style={{
          opacity: Math.max(0, fade),
          transform: "translateY(" + (1 - smooth(u * 12)) * 14 + "px)",
        }}
      >
        <div className="eyebrow">{chapter.eyebrow}</div>
        <h1>
          {chapter.title.split("\n").map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </h1>
        {part === "intro" && (
          <p>
            Land. Light. Water. Flight.
            <br />
            One connected design.
          </p>
        )}
        {part === "prompt" && (
          <div className="prompt">
            <span className="prompt-label">YOUR DESIGN BRIEF</span>
            {data.prompt.slice(
              0,
              Math.floor(Math.min(1, u * 2.5) * data.prompt.length),
            )}
            <span className="cursor">|</span>
            {u > 0.5 && (
              <div className="accepted">
                <i />
                Validated design · 188 planting nodes
              </div>
            )}
          </div>
        )}
        {part === "architecture" && (
          <div className="pipeline">
            {[
              "Design request",
              "Structured tool call",
              "Engineering validation",
              "Computed 3D landscape",
            ].map((x, i) => (
              <div className={u > i * 0.12 ? "revealed" : ""} key={x}>
                <span>0{i + 1}</span>
                {x}
              </div>
            ))}
            <small>React · Three.js · Python · EPANET</small>
          </div>
        )}
        {metrics.length > 0 && (
          <div className="metrics">
            {metrics.map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
        )}
        {part === "water" && (
          <p className="note">
            Actual solver events · replayed for presentation
          </p>
        )}
        {part === "economics" && (
          <div className="cashflow">
            {economic.cashflow.map((v, i) => (
              <div key={i}>
                <span
                  style={{
                    height: Math.max(7, Math.abs(v) / 900) + "px",
                    background: v < 0 ? "#b9c9d9" : "#478cdf",
                  }}
                />
                <small>{i === 0 ? "Initial" : "Y" + i}</small>
              </div>
            ))}
          </div>
        )}
        {part === "outro" && (
          <>
            <p>Explore the project.</p>
            <div className="repo">github.com/ddy314/demeter</div>
            <div className="opensource">OPEN SOURCE · MIT</div>
          </>
        )}
      </section>
      <footer>
        <span>
          DEMETER / {String(story.indexOf(chapter) + 1).padStart(2, "0")}
        </span>
        <div className="progress">
          <i style={{ width: (time / 166) * 100 + "%" }} />
        </div>
        <span>DESIGN IN CONTEXT</span>
      </footer>
    </div>
  );
}
fetch("/video-data.json")
  .then((r) => r.json())
  .then((data) =>
    createRoot(document.getElementById("root")!).render(<Film data={data} />),
  );
