import { memo } from "react";
import { useMemo, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Scene } from "../types";
import { elevation, random, xyz } from "./model";
function inside(x: number, y: number, ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function GroundDetail({ scene, clay }: { scene: Scene; clay: boolean }) {
  const grass = useRef<THREE.InstancedMesh>(null),
    stones = useRef<THREE.InstancedMesh>(null);
  const samples = useMemo(() => {
    const rng = random(scene.seed + 333),
      tufts: { p: THREE.Vector3; r: number; s: number }[] = [],
      rocks: { p: THREE.Vector3; r: number; s: number }[] = [];
    for (let i = 0; i < 16000; i++) {
      const x = rng() * scene.width,
        y = rng() * scene.depth,
        u = x / scene.width,
        v = y / scene.depth;
      if (
        !inside(u, v, scene.boundary) ||
        scene.exclusions.some((r) => inside(u, v, r))
      )
        continue;
      const terrace = (v * scene.terraces) % 1;
      const lane = Math.abs((y % scene.row_spacing) - scene.row_spacing / 2);
      if (terrace < 0.7 && lane > 1.5)
        tufts.push({
          p: xyz(scene, [x, y, elevation(scene, y)]),
          r: rng() * 6.28,
          s: 0.3 + rng() * 0.4,
        });
      if (terrace > 0.77 && terrace < 0.98 && rng() < 0.22)
        rocks.push({
          p: xyz(scene, [x, y, elevation(scene, y) + 0.05]),
          r: rng() * 6.28,
          s: 0.13 + rng() * 0.28,
        });
    }
    return { tufts, rocks };
  }, [scene]);
  const blade = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.12, 0, 0, 0.08, 0, 0, 0.05, 1, 0.03, 0, 0, -0.1, 0, 0, 0.12, 0.1,
          0.8, 0.03, -0.1, 0, -0.08, 0.07, 0, 0.1, -0.15, 0.7, -0.04,
        ],
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  }, []);
  useLayoutEffect(() => {
    const obj = new THREE.Object3D();
    samples.tufts.forEach((t, i) => {
      obj.position.copy(t.p);
      obj.rotation.set(0, t.r, 0);
      obj.scale.setScalar(t.s);
      obj.updateMatrix();
      grass.current?.setMatrixAt(i, obj.matrix);
      grass.current?.setColorAt(
        i,
        new THREE.Color(["#82935c", "#627944", "#789452", "#8d9d6b"][i % 4]),
      );
    });
    samples.rocks.forEach((t, i) => {
      obj.position.copy(t.p);
      obj.rotation.set(t.r, t.r * 0.4, 0);
      obj.scale.set(t.s * 1.8, t.s * 0.7, t.s);
      obj.updateMatrix();
      stones.current?.setMatrixAt(i, obj.matrix);
      stones.current?.setColorAt(
        i,
        new THREE.Color(["#a69c8a", "#beb3a1", "#978b79"][i % 3]),
      );
    });
    for (const ref of [grass, stones])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor)
          ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
  }, [samples, clay]);
  if (clay) return null;
  return (
    <group>
      <instancedMesh
        ref={grass}
        args={[blade, undefined, samples.tufts.length]}
      >
        <meshStandardMaterial roughness={1} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh
        ref={stones}
        args={[undefined, undefined, samples.rocks.length]}
        receiveShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  );
}

export default memo(GroundDetail);
