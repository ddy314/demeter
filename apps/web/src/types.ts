export type Point = [number, number];
export type Scene = {
  version: 1;
  name: string;
  width: number;
  depth: number;
  rise: number;
  terraces: number;
  spacing: number;
  row_spacing: number;
  boundary: Point[];
  source: Point;
  exclusions: Point[][];
  budget: number;
  min_pressure: number;
  max_pressure: number;
  source_lpm: number;
  volume_l: number;
  seed: number;
};
export type TreeNode = {
  id: string;
  x: number;
  y: number;
  z: number;
  row: number;
  col: number;
  terrace: number;
};
export type Geometry = {
  nodes: TreeNode[];
  source: TreeNode;
  mesh: number[];
  area_m2: number;
  plantable_area_m2: number;
  candidate_edges: number;
  unreachable: string[];
  revision: string;
  routes?: Plan["edges"][];
  corridors?: [number, number, number][][];
};
export type Candidate = {
  id: string;
  cost: number;
  duration_min: number;
  energy_kwh: number;
  min_pressure: number;
  feasible: boolean;
  violations: string[];
  zones: number;
  trunk_mm: number;
  lateral_mm: number;
  pump: string;
  layout: number;
};
export type Plan = Candidate & {
  label: string;
  pressures: Record<string, number>;
  outflows_lpm: Record<string, number>;
  max_pressure: number;
  network_max_pressure: number;
  static_max_pressure: number;
  flow_lpm: number;
  max_velocity: number;
  mass_residual_m3s: number;
  length_m: number;
  coverage: number;
  edges: {
    id: string;
    a: string;
    b: string;
    length: number;
    points: [number, number, number][];
    trunk: boolean;
  }[];
  bom: {
    item: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    subtotal: number;
  }[];
  robustness: {
    passed: number;
    total: number;
    sample_min_pressure: number;
    assumptions: string;
    seed: number;
  };
};
export type Result = {
  status: "complete" | "infeasible";
  message: string;
  plans: Plan[];
  candidates: Candidate[];
  pareto_ids?: string[];
  rejections?: Record<string, number>;
  elapsed_s: number;
  evaluated?: number;
  feasible_count?: number;
  minimum_valid_cost?: number;
  unreachable?: string[];
};
export type RunEvent = {
  seq: number;
  type: string;
  run_id: string;
  revision: string;
  at: string;
  data: Record<string, unknown> & { message: string };
};
export const DEFAULT: Scene = {
  version: 1,
  name: "Azure Terraces",
  width: 120,
  depth: 70,
  rise: 32,
  terraces: 5,
  spacing: 6,
  row_spacing: 8,
  boundary: [
    [0.08, 0.08],
    [0.78, 0.04],
    [0.96, 0.45],
    [0.87, 0.91],
    [0.13, 0.86],
  ],
  source: [0.15, 0.16],
  exclusions: [],
  budget: 22000,
  min_pressure: 0.24,
  max_pressure: 0.95,
  source_lpm: 220,
  volume_l: 4,
  seed: 42,
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
export const LABELS: Record<string, string> = {
  balanced: "Balanced",
  economy: "Lowest cost",
  fast: "Fastest",
};
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    const d = data.detail;
    throw new Error(
      typeof d === "string"
        ? d
        : Array.isArray(d)
          ? d.map((x) => `${x.loc?.slice(1).join(".")}: ${x.msg}`).join("; ")
          : "Service temporarily unavailable",
    );
  }
  return data;
}
export function download(
  name: string,
  data: unknown,
  type = "application/json",
) {
  const blob = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SolverFrame = {
  candidate: Candidate;
  pressures: Record<string, number>;
  outflows_lpm: Record<string, number>;
  edges: Plan["edges"];
  seq: number;
};
