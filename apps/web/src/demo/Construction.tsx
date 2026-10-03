import {
  useEffect,
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { DemoScene } from "./types";
import type { Scene, Geometry } from "../types";
import { xyz, elevation } from "../scene/model";

import { fraction } from "./timeline";
const Time = createContext<{ current: number }>({ current: 100 });
export const useAssemblyTime = () => useContext(Time);
export function ConstructionClock({
  demo,
  children,
}: {
  demo?: DemoScene;
  children: ReactNode;
}) {
  const target = demo?.building ? demo.buildTime : 100;
  const time = useRef(target);
  useFrame((_, dt) => {
    // Large jumps are intentional timeline seeks. Small steps interpolate the UI clock.
    time.current =
      Math.abs(target - time.current) > 0.5 || !demo?.playing
        ? target
        : THREE.MathUtils.damp(time.current, target, 25, dt);
  }, -1);
  return <Time.Provider value={time}>{children}</Time.Provider>;
}
export function Assemble({
  start,
  duration = 0.7,
  lift = 0,
  children,
}: {
  start: number;
  duration?: number;
  lift?: number;
  children: ReactNode;
}) {
  const time = useAssemblyTime(),
    root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = fraction(time.current, start, duration),
      eased = 1 - Math.pow(1 - t, 3);
    root.current.visible = t > 0;
    root.current.scale.y = Math.max(0.001, eased);
    root.current.position.y = lift * (1 - eased);
  });
  return (
    <group ref={root} visible={false}>
      {children}
    </group>
  );
}
export function Trace({
  points,
  start,
  duration = 0.6,
  radius = 0.08,
}: {
  points: THREE.Vector3[];
  start: number;
  duration?: number;
  radius?: number;
}) {
  const time = useAssemblyTime(),
    tip = useRef<THREE.Mesh>(null);
  const { curve, geometry } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points);
    return {
      curve,
      geometry: new THREE.TubeGeometry(curve, 48, radius, 8, false),
    };
  }, [points, radius]);
  useFrame(() => {
    const t = fraction(time.current, start, duration);
    geometry.setDrawRange(0, Math.floor(t * 48) * 48);
    if (tip.current) {
      tip.current.visible = t > 0 && t < 1;
      tip.current.position.copy(curve.getPoint(t));
    }
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial
          color="#90aabd"
          metalness={0.72}
          roughness={0.25}
        />
      </mesh>
      <mesh ref={tip} visible={false}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshBasicMaterial color="#2ab3ff" toneMapped={false} />
      </mesh>
    </group>
  );
}
export function Survey({
  scene,
  geom,
  demo,
}: {
  scene: Scene;
  geom: Geometry;
  demo: DemoScene;
}) {
  const time = useAssemblyTime(),
    scan = useRef<THREE.Group>(null),
    marks = useRef<THREE.Group>(null);
  const guides = useMemo(
    () =>
      Array.from({ length: scene.terraces + 1 }, (_, i) => {
        const y = (i * scene.depth) / scene.terraces;
        return Array.from({ length: 81 }, (_, j) =>
          xyz(scene, [(j * scene.width) / 80, y, elevation(scene, y) + 0.08]),
        );
      }),
    [scene],
  );
  useFrame(() => {
    if (scan.current) {
      scan.current.position.z =
        scene.depth / 2 - scene.depth * fraction(time.current, 0.4, 4.2);
      scan.current.visible = demo.building && time.current < 4.6;
    }
    if (marks.current)
      marks.current.visible = demo.building && time.current < 10;
  });
  if (!demo.building) return null;
  return (
    <group>
      <gridHelper
        args={[
          Math.ceil((Math.max(scene.width, scene.depth) * 1.35) / 10) * 10,
          Math.ceil((Math.max(scene.width, scene.depth) * 1.35) / 10) * 2,
          "#adc7da",
          "#d5e0e9",
        ]}
        position={[0, -3.58, 0]}
      />
      {guides.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#619dc3"
          transparent
          opacity={0.3}
          lineWidth={0.75}
        />
      ))}
      <group ref={marks}>
        {geom.nodes.map((n) => (
          <mesh
            key={n.id}
            position={xyz(scene, [n.x, n.y, n.z - 1.36])}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.45, 0.53, 16]} />
            <meshBasicMaterial
              color="#399edb"
              transparent
              opacity={0.55}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <group ref={scan}>
        <mesh position={[0, scene.rise / 2 + 4, 0]}>
          <planeGeometry args={[scene.width + 4, scene.rise + 16]} />
          <meshBasicMaterial
            color="#42b7f3"
            transparent
            opacity={0.055}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <Line
          points={[
            [-scene.width / 2, -3.5, 0],
            [scene.width / 2, -3.5, 0],
          ]}
          color="#219de5"
          lineWidth={2}
        />
        {[-1, 1].map((k) => (
          <Line
            key={k}
            points={[
              [(k * scene.width) / 2, -3.5, 0],
              [(k * scene.width) / 2, scene.rise + 12, 0],
            ]}
            color="#81c2e6"
            lineWidth={1}
          />
        ))}
      </group>
    </group>
  );
}
