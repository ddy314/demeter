import { memo } from "react";
import { useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Scene, Geometry, Plan, SolverFrame } from "../types";
import { useAssemblyTime } from "../demo/Construction";
import { fraction as progressAt } from "../demo/timeline";
import { xyz, tube, pressureColor } from "./model";
export type PipePick = {
  kind: "pipe";
  id: string;
  length: number;
  diameter: number;
  node: string;
};
type Props = {
  scene: Scene;
  geom: Geometry;
  plan?: Plan;
  frame?: SolverFrame;
  pressure: boolean;
  flow: boolean;
  zone: number;
  onPick: (p: PipePick) => void;
  selected?: string;
  construction?: boolean;
};
function Pipe({
  geometry,
  curve,
  color,
  selected,
  onClick,
  delay,
  construction,
  duration = 0.8,
}: {
  geometry: THREE.BufferGeometry;
  curve: THREE.CatmullRomCurve3;
  color: THREE.Color;
  selected: boolean;
  onClick: () => void;
  delay: number;
  construction?: boolean;
  duration?: number;
}) {
  const { invalidate } = useThree();
  const tip = useRef<THREE.Mesh>(null);
  const time = useAssemblyTime();
  const material = useRef<THREE.MeshStandardMaterial>(null),
    age = useRef(0);
  const target = useMemo(
    () => (selected ? new THREE.Color("#57c9ff") : color),
    [color, selected],
  );
  useEffect(() => {
    age.current = 0;
  }, [geometry]);
  useFrame((_, dt) => {
    age.current += dt;
    if (!construction && age.current < delay + duration) invalidate();
    const fraction = construction
      ? progressAt(time.current, delay, duration)
      : progressAt(age.current, delay, duration);
    geometry.setDrawRange(
      0,
      Math.floor(((geometry.index?.count || 0) * fraction) / 3) * 3,
    );
    if (tip.current) {
      tip.current.visible = !!construction && fraction > 0 && fraction < 1;
      tip.current.position.copy(curve.getPoint(fraction));
    }
    if (material.current) {
      material.current.color.lerp(target, 1 - Math.exp(-dt * 9));
      material.current.emissiveIntensity = selected ? 0.35 : 0.03;
    }
  });
  return (
    <group>
      <mesh
        geometry={geometry}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <meshStandardMaterial
          ref={material}
          color={color}
          metalness={0.45}
          roughness={0.28}
          emissive="#359bda"
        />
      </mesh>
      <mesh ref={tip} visible={false}>
        <sphereGeometry args={[0.32, 12, 8]} />
        <meshBasicMaterial color="#38b8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}
function Network({
  scene,
  geom,
  plan,
  frame,
  pressure,
  flow,
  zone,
  onPick,
  selected,
  construction,
}: Props) {
  const edges = frame?.edges || plan?.edges || [],
    candidate = frame?.candidate || plan,
    pressures = frame?.pressures || plan?.pressures || {};
  const activeEdges = useMemo(() => {
    const active = new Set<string>();
    const parent = new Map(edges.map((e) => [e.b, e]));
    for (const n of geom.nodes) {
      if (
        Math.min(
          (candidate?.zones || 1) - 1,
          Math.floor((n.y / scene.depth) * (candidate?.zones || 1)),
        ) !== zone
      )
        continue;
      let id = n.id;
      let steps = 0;
      while (parent.has(id) && steps++ < edges.length) {
        const edge = parent.get(id)!;
        active.add(edge.id);
        id = edge.a;
      }
    }
    return active;
  }, [edges, geom.nodes, scene.depth, candidate?.zones, zone]);
  const schedule = useMemo(() => {
    const arrival = new Map<string, number>();
    const timing = new Map<string, { start: number; duration: number }>();
    const pending = [...edges];
    const children = new Set(edges.map((e) => e.b));
    edges.forEach((e) => {
      if (!children.has(e.a)) arrival.set(e.a, 0);
    });
    for (let pass = 0; pending.length && pass <= edges.length; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const e = pending[i];
        if (!arrival.has(e.a)) continue;
        const start = arrival.get(e.a)!;
        const duration = Math.max(3, e.length);
        timing.set(e.id, { start, duration });
        arrival.set(e.b, start + duration);
        pending.splice(i, 1);
      }
    }
    const end = Math.max(1, ...arrival.values());
    return new Map(
      [...timing].map(([id, t]) => [
        id,
        {
          start: 17.5 + (t.start / end) * 4.5,
          duration: (t.duration / end) * 4.5,
        },
      ]),
    );
  }, [edges]);
  const pipes = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        ...tube(e.points, scene, e.trunk ? 0.24 : 0.14),
      })),
    [edges, scene],
  );
  const fittings = useRef<THREE.InstancedMesh>(null),
    signals = useRef<THREE.InstancedMesh>(null),
    halos = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => pipes.forEach((p) => p.geometry.dispose()), [pipes]);
  useLayoutEffect(() => {
    geom.nodes.forEach((n, i) => {
      dummy.position.copy(xyz(scene, [n.x, n.y, n.z]));
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.setScalar(0.35);
      dummy.updateMatrix();
      fittings.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.y = n.z - 1.38;
      dummy.scale.setScalar(1.05);
      dummy.updateMatrix();
      halos.current?.setMatrixAt(i, dummy.matrix);
      halos.current?.setColorAt(
        i,
        pressureColor(
          pressures[n.id] ?? scene.min_pressure,
          scene.min_pressure,
          scene.max_pressure,
        ),
      );
    });
    for (const r of [fittings, halos])
      if (r.current) {
        r.current.instanceMatrix.needsUpdate = true;
        if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
        r.current.computeBoundingSphere();
      }
  }, [geom, scene, pressures, dummy, pressure]);
  useFrame(({ clock }) => {
    if (!signals.current || !flow) return;
    const time = clock.elapsedTime;
    let i = 0;
    for (const p of pipes) {
      for (let j = 0; j < 3; j++) {
        const t =
          ((time * (p.trunk ? 10 : 7)) / Math.max(p.length, 1) + j / 3) % 1;
        dummy.position.copy(p.curve.getPointAt(t));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(
          activeEdges.has(p.id) ? (p.trunk ? 0.28 : 0.19) : 0,
        );
        dummy.updateMatrix();
        signals.current.setMatrixAt(i++, dummy.matrix);
      }
    }
    signals.current.instanceMatrix.needsUpdate = true;
  });
  if (!candidate) return null;
  return (
    <group>
      {pipes.map((e, i) => (
        <Pipe
          key={e.id}
          geometry={e.geometry}
          curve={e.curve}
          delay={
            construction
              ? (schedule.get(e.id)?.start ?? 17.5)
              : Math.min(0.8, i * 0.007)
          }
          duration={construction ? (schedule.get(e.id)?.duration ?? 0.5) : 0.8}
          construction={construction}
          color={
            pressure
              ? pressureColor(
                  pressures[e.b] ?? scene.min_pressure,
                  scene.min_pressure,
                  scene.max_pressure,
                )
              : new THREE.Color(e.trunk ? "#23679a" : "#617f91")
          }
          selected={selected === e.id}
          onClick={() =>
            onPick({
              kind: "pipe",
              id: e.id,
              length: e.length,
              diameter: e.trunk ? candidate.trunk_mm : candidate.lateral_mm,
              node: e.b,
            })
          }
        />
      ))}
      <instancedMesh
        visible={!construction}
        ref={fittings}
        args={[undefined, undefined, geom.nodes.length]}
      >
        <torusGeometry args={[0.8, 0.25, 5, 10]} />
        <meshStandardMaterial
          color="#d3e1e8"
          metalness={0.7}
          roughness={0.25}
        />
      </instancedMesh>
      {pressure && (
        <instancedMesh
          ref={halos}
          args={[undefined, undefined, geom.nodes.length]}
        >
          <ringGeometry args={[1, 1.3, 32]} />
          <meshBasicMaterial
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </instancedMesh>
      )}
      {flow && (
        <instancedMesh
          ref={signals}
          args={[undefined, undefined, pipes.length * 3]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 6, 4]} />
          <meshBasicMaterial color="#78d8ff" toneMapped={false} />
        </instancedMesh>
      )}
      {flow &&
        geom.nodes
          .filter(
            (n) =>
              Math.min(
                candidate.zones - 1,
                Math.floor((n.y / scene.depth) * candidate.zones),
              ) === zone,
          )
          .map((n) => (
            <Nozzle
              key={n.id}
              position={xyz(scene, [n.x, n.y, n.z])}
              phase={n.col * 0.2 + n.row}
            />
          ))}
    </group>
  );
}
function Nozzle({
  position,
  phase,
}: {
  position: THREE.Vector3;
  phase: number;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const t = (clock.elapsedTime * 0.65 + phase) % 1;
      ring.current.scale.setScalar(0.3 + t * 1.9);
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        (1 - t) * 0.22;
    }
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.5, 8]} />
        <meshStandardMaterial color="#82b4ce" metalness={0.5} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <ringGeometry args={[0.9, 1, 24]} />
        <meshBasicMaterial
          color="#8ed7ef"
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
export function Corridors({
  scene,
  geom,
  active,
}: {
  scene: Scene;
  geom: Geometry;
  active: boolean;
}) {
  return active ? (
    <group>
      {geom.corridors?.map((p, i) => (
        <Line
          key={i}
          points={p.map((p) => xyz(scene, p))}
          color="#5e9abb"
          lineWidth={0.65}
          transparent
          opacity={0.24}
          dashed
          dashSize={0.5}
          gapSize={0.5}
        />
      ))}
    </group>
  ) : null;
}

export default memo(Network);
