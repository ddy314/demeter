import { DEFAULT } from "../types";
import type { Preset, StudyInputs } from "./types";
export const STUDY_DEFAULT: StudyInputs = {
  latitude: 30.6,
  day: 172,
  greenhouses: 0,
  transmission: 0.72,
  greenhouse_cost_m2: 150,
  yield_kg_tree: 35,
  price_kg: 8,
  operating_cost_tree: 110,
  protected_yield_factor: 1.2,
  swath_m: 5,
  drone_speed_ms: 3,
  drone_service_mu: 18,
  annual_operations: 6,
};
const DEMO_FIELD = { ...DEFAULT, width: 180, depth: 105 };
export const PRESETS: Preset[] = [
  {
    id: "mountain",
    title: "A Year on the Hillside",
    subtitle: "Mountain orchard · Integrated planning",
    prompt:
      "Plan a 180 × 105 m hillside orchard with a 32 m elevation change. Study summer sunlight, compare irrigation networks, simulate drone coverage and estimate annual costs and returns. Finish with a guided tour of the design.",
    scene: { ...DEMO_FIELD, budget: 46000 },
    inputs: { ...STUDY_DEFAULT },
  },
  {
    id: "glass",
    title: "Room for Sunlight",
    subtitle: "Protected orchard · Three greenhouses",
    prompt:
      "Place three light-transmitting greenhouses on level terraces in a gently sloping orchard. Analyze winter shade and roof transmission, design irrigation and route a drone around the structures. Compare five-year cash flow using the supplied price, yield and construction costs.",
    scene: { ...DEMO_FIELD, name: "Sunfield Orchard", rise: 4, budget: 50000 },
    inputs: { ...STUDY_DEFAULT, day: 355, greenhouses: 3 },
  },
  {
    id: "flight",
    title: "Along the Mountain Wind",
    subtitle: "Winter orchard · Flight paths & sunlight",
    prompt:
      "Explore winter sunlight across a hillside orchard. Plan drone coverage with a 4 m swath, showing flight, spraying, transit and coverage. Calculate irrigation and annual operating costs, then tour the results with a moving camera.",
    scene: {
      ...DEMO_FIELD,
      name: "Cloudridge Orchard",
      rise: 38,
      budget: 48000,
    },
    inputs: { ...STUDY_DEFAULT, day: 355, swath_m: 4 },
  },
];
