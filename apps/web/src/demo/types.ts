import type { Geometry, Scene } from "../types";
export type StudyInputs = {
  latitude: number;
  day: number;
  greenhouses: number;
  transmission: number;
  greenhouse_cost_m2: number;
  yield_kg_tree: number;
  price_kg: number;
  operating_cost_tree: number;
  protected_yield_factor: number;
  swath_m: number;
  drone_speed_ms: number;
  drone_service_mu: number;
  annual_operations: number;
};
export type Greenhouse = {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  area_m2: number;
  bounds: number[];
};
export type FlightSegment = {
  a: [number, number, number];
  b: [number, number, number];
  spray: boolean;
};
export type Study = {
  revision: string;
  inputs: StudyInputs;
  greenhouses: Greenhouse[];
  unplaced_greenhouses: number;
  light: {
    nodes: Record<
      string,
      { direct_hours: number; effective_hours: number; protected: boolean }
    >;
    mean_hours: number;
    daylight_hours: number;
    weakest: string;
    best: string;
    sun_samples: { hour: number; vector: number[] }[];
  };
  drone: {
    segments: FlightSegment[];
    distance_m: number;
    duration_min: number;
    coverage_pct: number;
    target_area_m2: number;
    covered_area_m2: number;
    altitude_m: number;
  };
  economics: {
    yield_kg: number;
    revenue: number;
    operating_cost: number;
    greenhouse_capex: number;
    annual_drone: number;
    protected_trees: number;
    maintenance_rate: number;
  };
  assumptions: string[];
};
export type Shot = {
  position: [number, number, number];
  target: [number, number, number];
  key: string;
};
export type DemoScene = {
  stage: number;
  building: boolean;
  buildTime: number;
  study?: Study;
  chapter: string;
  playing: boolean;
  sunHour: number;
  shot: Shot;
  buildKey: number;
  renderTime?: number;
};
export type Preset = {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  scene: Scene;
  inputs: StudyInputs;
};

export type DesignTrace = {
  id: string;
  provider: "mock" | "nebius";
  model: string;
  prompt: string;
  tool: string;
  patch: { scene?: Partial<Scene>; inputs?: Partial<StudyInputs> };
  changes: { field: string; before: number | string; after: number | string }[];
  base_revision: string;
  revision: string;
  created_at: string;
  latency_ms: number;
  usage: Record<string, number>;
};
export type DesignResponse =
  | { status: "clarification"; question: string; provider: string }
  | {
      status: "ready";
      scene: Scene;
      inputs: StudyInputs;
      geometry: Geometry;
      trace: DesignTrace;
    };
