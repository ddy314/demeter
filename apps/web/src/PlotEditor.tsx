import { useState, useRef } from "react";
import {
  MousePointer2,
  Droplets,
  Pentagon,
  Ban,
  Undo2,
  Check,
} from "lucide-react";
import type { Scene, Point } from "./types";
type Mode = "vertex" | "source" | "boundary" | "exclusion";
export default function PlotEditor({
  scene,
  onChange,
  disabled,
}: {
  scene: Scene;
  onChange: (s: Scene) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>("vertex"),
    [drawing, setDrawing] = useState<Point[]>([]),
    [drag, setDrag] = useState<number | null>(null),
    [local, setLocal] = useState<Point[] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const history = useRef<Scene[]>([]);
  const point = (e: React.PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [
      Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)),
      Math.max(0.02, Math.min(0.98, (e.clientY - r.top) / r.height)),
    ];
  };
  const commit = (s: Scene) => {
    history.current.push(structuredClone(scene));
    onChange(s);
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setDrawing([]);
  };
  const finish = () => {
    if (drawing.length < 3) return;
    commit(
      mode === "boundary"
        ? { ...scene, boundary: drawing }
        : { ...scene, exclusions: [...scene.exclusions, drawing] },
    );
    setDrawing([]);
    setMode("vertex");
  };
  const pts = (p: Point[]) =>
    p.map(([x, y]) => `${x * 240},${y * 148}`).join(" ");
  return (
    <div className="plot-editor">
      <div className="plot-tools">
        {(
          [
            ["vertex", MousePointer2, "Edit boundary"],
            ["source", Droplets, "Place source"],
            ["boundary", Pentagon, "Draw boundary"],
            ["exclusion", Ban, "Draw exclusion"],
          ] as const
        ).map(([m, Icon, label]) => (
          <button
            key={m}
            title={label}
            aria-label={label}
            disabled={disabled}
            className={mode === m ? "active" : ""}
            onClick={() => switchMode(m)}
          >
            <Icon size={14} />
          </button>
        ))}
        <span />
        <button
          aria-label="Undo plot edit"
          title="Undo plot edit"
          disabled={disabled}
          onClick={() => {
            const prev = history.current.pop();
            if (prev) onChange(prev);
          }}
        >
          <Undo2 size={14} />
        </button>
      </div>
      <svg
        ref={svg}
        viewBox="0 0 240 148"
        preserveAspectRatio="none"
        aria-label="Editable plot map"
        className={`plot-svg mode-${mode}`}
        onPointerDown={(e) => {
          if (disabled || drag !== null) return;
          const p = point(e);
          if (mode === "source") commit({ ...scene, source: p });
          if (mode === "boundary" || mode === "exclusion")
            setDrawing([...drawing, p]);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const b = [...(local || scene.boundary)];
          b[drag] = point(e);
          setLocal(b);
        }}
        onPointerUp={() => {
          if (drag !== null && local) commit({ ...scene, boundary: local });
          setDrag(null);
          setLocal(null);
        }}
        onPointerCancel={() => {
          setDrag(null);
          setLocal(null);
        }}
      >
        <defs>
          <pattern
            id="plotGrid"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 16 0 L 0 0 0 16"
              fill="none"
              stroke="#e0e6ec"
              strokeWidth=".5"
            />
          </pattern>
        </defs>
        <rect width="240" height="148" fill="url(#plotGrid)" />
        <polygon
          points={pts(local || scene.boundary)}
          fill="#2583e612"
          stroke="#729abb"
          strokeWidth="1.2"
        />
        {Array.from({ length: scene.terraces - 1 }, (_, i) => (
          <line
            key={i}
            x1="27"
            x2="211"
            y1={((i + 1) * 148) / scene.terraces}
            y2={((i + 1) * 148) / scene.terraces}
            stroke="#a3b4c5"
            strokeWidth=".7"
            strokeDasharray="3 3"
          />
        ))}
        {scene.exclusions.map((r, i) => (
          <polygon key={i} points={pts(r)} fill="#dca68430" stroke="#ce8c77" />
        ))}
        {(local || scene.boundary).map(([x, y], i) => (
          <circle
            key={i}
            cx={x * 240}
            cy={y * 148}
            r={3.5}
            fill="#438dd0"
            stroke="#ffffff"
            onPointerDown={(e) => {
              if (mode !== "vertex" || disabled) return;
              e.stopPropagation();
              svg.current!.setPointerCapture(e.pointerId);
              setDrag(i);
              setLocal([...scene.boundary]);
            }}
          />
        ))}
        <circle
          cx={scene.source[0] * 240}
          cy={scene.source[1] * 148}
          r="5"
          fill="#287acf"
          stroke="#cce3f4"
          strokeWidth="2"
        />
        {drawing.length > 0 && (
          <polyline
            points={pts(drawing)}
            fill="#d5e49f18"
            stroke="#348acf"
            strokeWidth="1.5"
          />
        )}
        {drawing.map(([x, y], i) => (
          <circle key={i} cx={x * 240} cy={y * 148} r="3" fill="#348acf" />
        ))}
        <text x="224" y="14" fill="#93a5b3" fontSize="8">
          N ↑
        </text>
      </svg>
      <div className="plot-hint">
        {drawing.length > 0 ? (
          <>
            <span>{drawing.length} vertices</span>
            <button disabled={drawing.length < 3} onClick={finish}>
              <Check size={12} />
              Finish drawing
            </button>
          </>
        ) : (
          <span>
            {mode === "vertex"
              ? "Drag vertices to adjust the boundary"
              : mode === "source"
                ? "Click inside the plot to place the source"
                : mode === "boundary"
                  ? "Click to add vertices, then close the boundary"
                  : "Draw an area excluded from planting and pipes"}
          </span>
        )}
      </div>
      {scene.exclusions.length > 0 && (
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => commit({ ...scene, exclusions: [] })}
        >
          Clear exclusions ({scene.exclusions.length})
        </button>
      )}
    </div>
  );
}
