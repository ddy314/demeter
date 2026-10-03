import * as THREE from "three";
import type { Scene } from "../types";
export const xyz = (s: Scene, p: number[]): THREE.Vector3 =>
  new THREE.Vector3(p[0] - s.width / 2, p[2], s.depth / 2 - p[1]);
export function elevation(s: Scene, y: number) {
  const t = Math.min(s.terraces - 1, Math.max(0, (y / s.depth) * s.terraces));
  return (
    (s.rise / (s.terraces - 1)) *
    (Math.floor(t) + Math.max(0, ((t % 1) - 0.76) / 0.24))
  );
}
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function leafGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, -0.56, 0, -0.22, -0.19, 0.05, 0.22, -0.19, 0.05, -0.24, 0.16, 0.1,
        0.24, 0.16, 0.1, 0, 0.57, -0.02, 0, 0, 0.13,
      ],
      3,
    ),
  );
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0.5, 0, 0, 0.3, 1, 0.3, 0, 0.65, 1, 0.65, 0.5, 1, 0.5, 0.5],
      2,
    ),
  );
  g.setIndex([0, 1, 6, 0, 6, 2, 1, 3, 6, 2, 6, 4, 3, 5, 6, 4, 6, 5]);
  g.computeVertexNormals();
  return g;
}
export function tube(points: number[][], scene: Scene, radius: number) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => xyz(scene, p)),
    false,
    "centripetal",
  );
  return {
    curve,
    geometry: new THREE.TubeGeometry(
      curve,
      Math.max(4, points.length * 2),
      radius,
      8,
      false,
    ),
  };
}
export const pressureColor = (p: number, min: number, max: number) =>
  new THREE.Color(p < min ? "#f39d55" : p > max ? "#9565e8" : "#2489d8").lerp(
    new THREE.Color("#70d7e3"),
    Math.min(1, Math.max(0, (p - min) / (max - min))),
  );
