import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FlaskConical,
  Route,
  Timer,
  Wallet,
  Zap,
} from "lucide-react";
import {
  type Candidate,
  type Plan,
  type Result,
  LABELS,
  money,
  download,
} from "./types";
export function Frontier({
  candidates,
  plans,
  selected,
  onSelect,
}: {
  candidates: Candidate[];
  plans: Plan[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState<Candidate>();
  const valid = candidates.filter((c) => c.duration_min > 0);
  if (!valid.length)
    return (
      <div className="chart-empty">
        <div className="chart-grid" />
        <span>Run the solver to compare candidates</span>
      </div>
    );
  const minX = Math.min(...valid.map((c) => c.cost)) * 0.94,
    maxX = Math.max(...valid.map((c) => c.cost)) * 1.03,
    minY = Math.min(...valid.map((c) => c.duration_min)) * 0.8,
    maxY = Math.max(...valid.map((c) => c.duration_min)) * 1.1;
  const x = (n: number) => 35 + ((n - minX) / Math.max(1, maxX - minX)) * 211,
    y = (n: number) => 115 - ((n - minY) / Math.max(1, maxY - minY)) * 91;
  return (
    <div className="frontier">
      <svg
        viewBox="0 0 265 151"
        role="img"
        aria-label="Plan cost and duration scatter plot"
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="35"
              y1={24 + i * 30.3}
              x2="246"
              y2={24 + i * 30.3}
              stroke="#e5ebf0"
              strokeDasharray="2 4"
            />
            <text x="27" y={28 + i * 30.3} textAnchor="end">
              {(maxY - ((maxY - minY) * i) / 3).toFixed(0)}
            </text>
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <text key={i} x={35 + i * 105.5} y="133" textAnchor="middle">
            {((minX + ((maxX - minX) * i) / 2) / 1000).toFixed(1)}k
          </text>
        ))}
        <text x="4" y="10">
          min
        </text>
        <text x="253" y="145" textAnchor="end">
          Cost / CNY
        </text>
        {valid.map((c) => (
          <circle
            key={c.id}
            cx={x(c.cost)}
            cy={y(c.duration_min)}
            r={c.id === selected ? 5 : 2.7}
            fill={
              c.id === selected ? "#1682d5" : c.feasible ? "#90b9d6" : "#b3bac1"
            }
            opacity={c.feasible ? 1 : 0.4}
            stroke={c.id === selected ? "#1b7ccd" : "none"}
            strokeWidth="1.5"
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(undefined)}
            onClick={() => {
              if (plans.some((p) => p.id === c.id)) onSelect(c.id);
            }}
          >
            <title>
              {c.id} · ¥{money(c.cost)} · {c.duration_min} min
              {c.feasible ? " · Feasible" : ` · ${c.violations.join(" / ")}`}
            </title>
          </circle>
        ))}
      </svg>
      <div className="chart-legend">
        {hover ? (
          <span>
            {hover.id} · ¥{money(hover.cost)} / {hover.duration_min} min
          </span>
        ) : (
          <>
            <span>
              <i className="lime" />
              Feasible
            </span>
            <span>
              <i />
              Rejected
            </span>
            <span className="muted">Lower and faster is better</span>
          </>
        )}
      </div>
    </div>
  );
}
export default function Results({
  result,
  candidates,
  selected,
  onSelect,
  running,
}: {
  result?: Result;
  candidates: Candidate[];
  selected?: Plan;
  onSelect: (id: string) => void;
  running: boolean;
}) {
  const [details, setDetails] = useState(false);
  const exportBom = () => {
    if (!selected) return;
    download(
      `demeter-${selected.id}-bom.csv`,
      "\uFEFFItem,Quantity,Unit,Unit price (CNY),Subtotal (CNY)\n" +
        selected.bom
          .map((b) =>
            [b.item, b.quantity, b.unit, b.unit_cost, b.subtotal].join(","),
          )
          .join("\n"),
      "text/csv;charset=utf-8",
    );
  };
  return (
    <aside className="results-panel">
      <div className="panel-heading">
        <span className="eyebrow">DESIGN EXPLORER</span>
        <span className="small-tag">{result?.plans.length || "—"} plans</span>
      </div>
      <h2>
        Design options<span>Balance investment and performance.</span>
      </h2>
      <div className="chart-card">
        <div className="section-title">
          Cost × Duration <ArrowUpRight size={14} />
        </div>
        <Frontier
          candidates={candidates}
          plans={result?.plans || []}
          selected={selected?.id}
          onSelect={onSelect}
        />
      </div>
      {result?.status === "infeasible" ? (
        <div className="infeasible">
          <FlaskConical size={22} />
          <h3>No feasible plan</h3>
          <p>{result.message}</p>
          {result.minimum_valid_cost && (
            <p>
              Lowest hydraulically feasible cost:{" "}
              <b>¥{money(result.minimum_valid_cost)}</b>。
            </p>
          )}
          <p>Adjust the budget, flow or terrain and try again.</p>
        </div>
      ) : result?.plans.length ? (
        <>
          <div className="solution-list">
            {result.plans.map((p, i) => (
              <button
                key={p.id}
                className={`solution-card ${selected?.id === p.id ? "selected" : ""}`}
                onClick={() => onSelect(p.id)}
              >
                <div className="solution-top">
                  <span className="solution-index">0{i + 1}</span>
                  <b>{LABELS[p.label]}</b>
                  <span className="solution-code">{p.id}</span>
                  {selected?.id === p.id && <Check size={15} />}
                </div>
                <div className="solution-stats">
                  <span>
                    ¥{money(p.cost)}
                    <small>Estimated capital cost</small>
                  </span>
                  <span>
                    {p.duration_min.toFixed(1)}
                    <em> min</em>
                    <small>Watering cycle</small>
                  </span>
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <>
              <div className="selected-specs">
                <div>
                  <Route size={15} />
                  <span>Pipe length</span>
                  <b>{selected.length_m} m</b>
                </div>
                <div>
                  <Zap size={15} />
                  <span>Energy per cycle</span>
                  <b>{selected.energy_kwh.toFixed(3)} kWh</b>
                </div>
                <div>
                  <Timer size={15} />
                  <span>Irrigation zones</span>
                  <b>
                    {selected.zones} {selected.zones === 1 ? "zone" : "zones"} ·{" "}
                    {selected.pump}
                  </b>
                </div>
              </div>
              <div className="validation-card">
                <div>
                  <FlaskConical size={15} />
                  <b>Sensitivity checks</b>
                  <span>
                    {selected.robustness.passed}/{selected.robustness.total}
                  </span>
                </div>
                <p>
                  ±5% Head / ±10% Roughness / ±1 m Elevation
                  <br />
                  Sampled sensitivity scenarios.
                </p>
              </div>
              <button
                className="details-toggle"
                onClick={() => setDetails(!details)}
              >
                Engineering checks & materials
                <ChevronDown size={14} className={details ? "rotated" : ""} />
              </button>
              {details && (
                <div className="engineering-details">
                  <dl>
                    <dt>Active node pressure</dt>
                    <dd>
                      {selected.min_pressure.toFixed(3)}–
                      {selected.max_pressure.toFixed(3)} MPa
                    </dd>
                    <dt>Peak operating pressure</dt>
                    <dd>{selected.network_max_pressure.toFixed(3)} MPa</dd>
                    <dt>Static pressure estimate</dt>
                    <dd>{selected.static_max_pressure.toFixed(3)} MPa</dd>
                    <dt>Peak supply flow</dt>
                    <dd>{selected.flow_lpm.toFixed(1)} L/min</dd>
                    <dt>Maximum pipe velocity</dt>
                    <dd>{selected.max_velocity.toFixed(2)} m/s</dd>
                    <dt>Mass balance residual</dt>
                    <dd>{selected.mass_residual_m3s.toExponential(1)} m³/s</dd>
                    <dt>Main / lateral diameter</dt>
                    <dd>
                      {selected.trunk_mm} / {selected.lateral_mm} mm
                    </dd>
                  </dl>
                  {selected.bom.map((b, i) => (
                    <div className="bom-row" key={i}>
                      <span>
                        {b.item}
                        <small>
                          {b.quantity} {b.unit} × ¥{b.unit_cost}
                        </small>
                      </span>
                      <b>¥{money(b.subtotal)}</b>
                    </div>
                  ))}
                  <button className="secondary-button full" onClick={exportBom}>
                    <Download size={14} />
                    Export materials CSV
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="empty-solutions">
          <div className="empty-icon">
            <Route size={30} />
          </div>
          <h3>{running ? "Finding feasible plans" : "Start with a field"}</h3>
          <p>
            {running
              ? "EPANET evaluates each configuration. Candidates appear as the solver progresses."
              : "Set the terrain and constraints to compare irrigation plans."}
          </p>
          <div>
            <Wallet size={14} />
            <span>Capital cost</span>
            <i />
            <Timer size={14} />
            <span>Operating efficiency</span>
          </div>
        </div>
      )}
      {result?.rejections && Object.keys(result.rejections).length > 0 && (
        <details className="rejection-details">
          <summary>
            Why candidates failed{" "}
            <span>
              {candidates.filter((c) => !c.feasible).length} configurations
            </span>
          </summary>
          {Object.entries(result.rejections).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
          <p>A configuration may violate multiple constraints.</p>
        </details>
      )}
      <div className="method-note">
        <span className="status-dot" />
        EPANET · Demo equipment catalog
        <p>
          The search covers 108 discrete configurations using a synthetic
          equipment catalog.
        </p>
      </div>
    </aside>
  );
}
