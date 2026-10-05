import type { DesignResponse, Study } from "./types";
import type { RunEvent } from "../types";

export const SHOWCASE = import.meta.env.VITE_SHOWCASE === "true";
type Capture = {
  design: Extract<DesignResponse, { status: "ready" }>;
  study: Study;
  events: RunEvent[];
};
const captures = new Map<string, Promise<Capture>>();
export function loadCapture(id: string): Promise<Capture> {
  if (!captures.has(id)) {
    const request = fetch(`${import.meta.env.BASE_URL}showcase/${id}.json`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The showcase could not load. Please refresh.");
        return response.json() as Promise<Capture>;
      })
      .catch((error) => {
        captures.delete(id);
        throw error;
      });
    captures.set(id, request);
  }
  return captures.get(id)!;
}
