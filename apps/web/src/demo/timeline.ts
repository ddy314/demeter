export const BUILD_DURATION = 26;
export const BUILD_STEPS = [
  {
    at: 0,
    end: 5,
    name: "Terrain",
    title: "From coordinates,\nto a landscape.",
    detail: "Scan the terrain. Shape each terrace.",
    code: "01 / TERRAIN RECONSTRUCTION",
  },
  {
    at: 5,
    end: 10,
    name: "Planting",
    title: "Row by row.\nTree by tree.",
    detail: "Place each tree and grow its canopy from the ground.",
    code: "02 / ORCHARD ASSEMBLY",
  },
  {
    at: 10,
    end: 17,
    name: "Structures",
    title: "Structure first.\nSurface next.",
    detail: "Set the foundations. Raise the arches. Fit the roof.",
    code: "03 / STRUCTURAL ASSEMBLY",
  },
  {
    at: 17,
    end: 23,
    name: "Network",
    title: "From the source,\nto every endpoint.",
    detail: "Lay the mains, then connect each branch.",
    code: "04 / NETWORK ASSEMBLY",
  },
  {
    at: 23,
    end: 26,
    name: "Ready",
    title: "Every system.\nOne living field.",
    detail: "The complete orchard, ready to explore.",
    code: "05 / SYSTEM OVERVIEW",
  },
];
export function fraction(time: number, start: number, duration: number) {
  return Math.max(0, Math.min(1, (time - start) / duration));
}
