import { memo } from "react";
import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Scene, Geometry } from "../types";
import { xyz } from "../scene/model";
import { Assemble, Trace } from "./Construction";
import type { DemoScene, Greenhouse } from "./types";

const Glasshouse = memo(function Glasshouse({
  site,
  scene,
  index,
}: {
  site: Greenhouse;
  scene: Scene;
  index: number;
}) {
  const start = 10 + index * 0.65;
  const curves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) =>
        Array.from({ length: 33 }, (_, j) => {
          const t = (j / 32) * Math.PI;
          return new THREE.Vector3(
            -site.width / 2 + (i * site.width) / 8,
            1.8 + Math.sin(t) * 4.8,
            (Math.cos(t) * site.depth) / 2,
          );
        }),
      ),
    [site],
  );
  const panels = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const g = new THREE.BufferGeometry(),
          v: number[] = [],
          idx: number[] = [];
        for (let x = 0; x < 2; x++)
          for (let j = 0; j <= 24; j++) {
            const t = (j / 24) * Math.PI;
            v.push(
              -site.width / 2 + ((i + x) * site.width) / 8,
              1.8 + Math.sin(t) * 4.8,
              (Math.cos(t) * site.depth) / 2,
            );
          }
        for (let j = 0; j < 24; j++)
          idx.push(j, j + 1, 25 + j, j + 1, 26 + j, 25 + j);
        g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }),
    [site],
  );
  useEffect(() => () => panels.forEach((g) => g.dispose()), [panels]);
  return (
    <group position={xyz(scene, [site.x, site.y, site.z])}>
      <Assemble start={start} duration={0.65}>
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh position={[0, 0.12, (k * site.depth) / 2]} receiveShadow>
              <boxGeometry args={[site.width + 0.5, 0.24, 0.35]} />
              <meshStandardMaterial color="#bccad2" />
            </mesh>
            <mesh position={[(k * site.width) / 2, 0.12, 0]} receiveShadow>
              <boxGeometry args={[0.35, 0.24, site.depth + 0.5]} />
              <meshStandardMaterial color="#bccad2" />
            </mesh>
          </group>
        ))}
      </Assemble>
      {curves.map((points, i) => (
        <group key={i}>
          <Assemble start={start + 0.35 + i * 0.22} duration={0.65}>
            {[-1, 1].map((k) => (
              <mesh
                key={k}
                position={[
                  -site.width / 2 + (i * site.width) / 8,
                  0.9,
                  (k * site.depth) / 2,
                ]}
                castShadow
              >
                <cylinderGeometry args={[0.095, 0.095, 1.8, 10]} />
                <meshStandardMaterial
                  color="#a4b8c8"
                  metalness={0.7}
                  roughness={0.25}
                />
              </mesh>
            ))}
          </Assemble>
          <Trace
            points={points}
            start={start + 0.9 + i * 0.22}
            duration={0.9}
          />
        </group>
      ))}
      {[-1, 0, 1].map((k) => (
        <Trace
          key={k}
          start={start + 2.6 + Math.abs(k) * 0.2}
          duration={1}
          points={[
            new THREE.Vector3(
              -site.width / 2,
              k === 0 ? 6.6 : 1.8,
              (k * site.depth) / 2,
            ),
            new THREE.Vector3(
              site.width / 2,
              k === 0 ? 6.6 : 1.8,
              (k * site.depth) / 2,
            ),
          ]}
        />
      ))}
      {panels.map((geometry, i) => (
        <Assemble
          key={i}
          start={start + 3.4 + i * 0.15}
          duration={0.7}
          lift={1.8}
        >
          <mesh geometry={geometry}>
            <meshPhysicalMaterial
              color="#a9d3e5"
              transparent
              opacity={0.26}
              roughness={0.12}
              metalness={0.2}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </Assemble>
      ))}
      <Assemble start={start + 4.5} duration={0.8}>
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh position={[0, 0.95, (k * site.depth) / 2]}>
              <boxGeometry args={[site.width, 1.8, 0.035]} />
              <meshPhysicalMaterial
                color="#b5dbea"
                transparent
                opacity={0.22}
                depthWrite={false}
              />
            </mesh>
            <group position={[(k * site.width) / 2, 0, 0]}>
              {[-1, 1].map((z) => (
                <mesh key={z} position={[0, 1.35, z * 1.1]}>
                  <boxGeometry args={[0.12, 2.7, 0.12]} />
                  <meshStandardMaterial color="#92aabc" metalness={0.6} />
                </mesh>
              ))}
              <mesh position={[0, 2.7, 0]}>
                <boxGeometry args={[0.12, 0.12, 2.3]} />
                <meshStandardMaterial color="#92aabc" />
              </mesh>
              <mesh position={[0, 1.35, 0]}>
                <boxGeometry args={[0.045, 2.6, 2.1]} />
                <meshPhysicalMaterial
                  color="#d8edf5"
                  transparent
                  opacity={0.3}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, 4.4, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.65, 0.65, 0.22, 24]} />
                <meshStandardMaterial color="#c3d7e1" metalness={0.7} />
              </mesh>
              <Line
                points={[
                  [0, 2.7, -1.1],
                  [0, 5.7, 0],
                  [0, 2.7, 1.1],
                ]}
                color="#849fb2"
                lineWidth={1}
              />
            </group>
          </group>
        ))}
      </Assemble>
    </group>
  );
});
const Infrastructure = memo(function Infrastructure({
  scene,
  geom,
}: {
  scene: Scene;
  geom: Geometry;
}) {
  const base = xyz(scene, [geom.source.x, geom.source.y, geom.source.z - 1.5]);
  return (
    <group position={base}>
      <Assemble start={10.2} duration={1}>
        <mesh position={[-4, 0.08, 0]} receiveShadow>
          <boxGeometry args={[6, 0.16, 5]} />
          <meshStandardMaterial color="#d3dfe4" roughness={0.8} />
        </mesh>
      </Assemble>
      {[-1, 1].map((z, i) => (
        <Assemble key={z} start={11 + i * 0.6} duration={1.1}>
          <group position={[-4, 0, z * 1.35]}>
            <mesh position={[0, 1.75, 0]} castShadow>
              <cylinderGeometry args={[0.92, 0.92, 3.4, 32]} />
              <meshStandardMaterial
                color="#e1ebef"
                metalness={0.58}
                roughness={0.3}
              />
            </mesh>
            {[0.5, 1.7, 2.9].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.93, 0.035, 6, 32]} />
                <meshStandardMaterial color="#8da9ba" metalness={0.8} />
              </mesh>
            ))}
            <mesh position={[0, 3.5, 0]}>
              <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
              <meshStandardMaterial color="#7796a9" />
            </mesh>
            <mesh position={[0.94, 1.7, 0]}>
              <boxGeometry args={[0.06, 2, 0.12]} />
              <meshStandardMaterial color="#5bb3d8" />
            </mesh>
          </group>
        </Assemble>
      ))}
      <Assemble start={12} duration={1.2}>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <mesh
              key={`${x}${z}`}
              position={[x * 2.7, 2.7, z * 2.3]}
              castShadow
            >
              <boxGeometry args={[0.16, 5.4, 0.16]} />
              <meshStandardMaterial color="#9eb3c0" metalness={0.65} />
            </mesh>
          )),
        )}
      </Assemble>
      {Array.from({ length: 6 }, (_, i) => (
        <Assemble key={i} start={13 + i * 0.24} duration={0.8} lift={3}>
          <group
            position={[
              ((i % 3) - 1) * 1.8,
              5.5 + (i < 3 ? 0.35 : 0),
              i < 3 ? -1.25 : 1.25,
            ]}
            rotation={[-0.12, 0, 0]}
          >
            <mesh castShadow>
              <boxGeometry args={[1.73, 0.12, 2.45]} />
              <meshStandardMaterial
                color="#718eaa"
                metalness={0.6}
                roughness={0.23}
              />
            </mesh>
            <mesh position={[0, 0.072, 0]}>
              <boxGeometry args={[1.61, 0.025, 2.33]} />
              <meshStandardMaterial
                color="#254d72"
                metalness={0.5}
                roughness={0.24}
              />
            </mesh>
            {[-0.5, 0, 0.5].map((x) => (
              <mesh key={x} position={[x, 0.09, 0]}>
                <boxGeometry args={[0.014, 0.01, 2.33]} />
                <meshBasicMaterial color="#749bbc" />
              </mesh>
            ))}
            {[-0.8, -0.4, 0, 0.4, 0.8].map((z) => (
              <mesh key={z} position={[0, 0.09, z]}>
                <boxGeometry args={[1.61, 0.01, 0.014]} />
                <meshBasicMaterial color="#749bbc" />
              </mesh>
            ))}
          </group>
        </Assemble>
      ))}
      <Assemble start={15.3} duration={0.8}>
        <group position={[4, 0, 0]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[1.5, 2.4, 1]} />
            <meshStandardMaterial color="#e2e9ed" metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.5, 0.52]}>
            <boxGeometry args={[0.9, 0.55, 0.04]} />
            <meshStandardMaterial color="#2c4b66" />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <cylinderGeometry args={[0.065, 0.09, 6, 10]} />
            <meshStandardMaterial color="#819cad" metalness={0.7} />
          </mesh>
          <mesh position={[0, 7.2, 0]}>
            <boxGeometry args={[1.1, 0.18, 0.65]} />
            <meshStandardMaterial color="#e9eff2" />
          </mesh>
          <mesh position={[0, 7.4, 0]}>
            <sphereGeometry args={[0.16, 12, 8]} />
            <meshBasicMaterial color="#42b4ea" />
          </mesh>
          <Line
            points={[
              [-0.8, 6.4, 0],
              [0.8, 6.4, 0],
            ]}
            color="#7698ae"
            lineWidth={2}
          />
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.8, 6.45, 0]}>
              <sphereGeometry args={[0.22, 12, 8]} />
              <meshStandardMaterial color="#c7d9e4" />
            </mesh>
          ))}
        </group>
      </Assemble>
    </group>
  );
});
function SunStudy({
  scene,
  geom,
  demo,
}: {
  scene: Scene;
  geom: Geometry;
  demo: DemoScene;
}) {
  const samples = demo.study?.light.sun_samples || [];
  const current = samples.reduce(
    (best, s) =>
      Math.abs(s.hour - demo.sunHour) < Math.abs(best.hour - demo.sunHour)
        ? s
        : best,
    samples[0],
  );
  if (!current) return null;
  const center = new THREE.Vector3(0, scene.rise * 0.5, 0),
    radius = 74 * Math.max(scene.width / 120, scene.depth / 70);
  const path = samples.map((s) =>
    center
      .clone()
      .add(
        new THREE.Vector3(
          s.vector[0],
          s.vector[2],
          -s.vector[1],
        ).multiplyScalar(radius),
      ),
  );
  const pos = center
    .clone()
    .add(
      new THREE.Vector3(
        current.vector[0],
        current.vector[2],
        -current.vector[1],
      ).multiplyScalar(radius),
    );
  return (
    <group>
      <Line
        points={path}
        color="#d7ad56"
        lineWidth={1.2}
        transparent
        opacity={0.6}
      />
      <mesh position={pos}>
        <sphereGeometry args={[2, 24, 16]} />
        <meshBasicMaterial color="#efc875" />
      </mesh>
      <Line
        points={[pos, center]}
        dashed
        dashSize={1}
        gapSize={1.5}
        color="#dfb961"
        transparent
        opacity={0.35}
      />
      {geom.nodes.map((n) => {
        const value = demo.study!.light.nodes[n.id];
        const factor =
          value.effective_hours / Math.max(1, demo.study!.light.daylight_hours);
        return (
          <mesh
            key={n.id}
            position={xyz(scene, [n.x, n.y, n.z - 1.32])}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[2.7, 24]} />
            <meshBasicMaterial
              color={new THREE.Color("#579bc7").lerp(
                new THREE.Color("#ebc268"),
                factor,
              )}
              transparent
              opacity={0.42}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
function Drone({ scene, demo }: { scene: Scene; demo: DemoScene }) {
  const root = useRef<THREE.Group>(null),
    rotors = useRef<THREE.Group>(null),
    spray = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const segments = useMemo(() => {
    let total = 0;
    return (demo.study?.drone.segments || []).map((s) => {
      const a = xyz(scene, s.a),
        b = xyz(scene, s.b),
        length = a.distanceTo(b);
      const start = total;
      total += length;
      return { ...s, a, b, length, start, end: total };
    });
  }, [scene, demo.study]);
  const total = segments.at(-1)?.end || 1;
  useEffect(() => {
    elapsed.current = 0;
  }, [segments, demo.buildKey]);
  useFrame((_, dt) => {
    if (!root.current || !segments.length) return;
    if (demo.playing) elapsed.current += Math.min(dt, 0.05);
    const distance =
      (elapsed.current * (demo.study?.inputs.drone_speed_ms || 3) * 6) % total;
    const s = segments.find((s) => distance < s.end) || segments[0],
      t = (distance - s.start) / Math.max(s.length, 0.001);
    root.current.position.lerpVectors(s.a, s.b, t);
    root.current.rotation.y = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
    if (rotors.current)
      rotors.current.children.forEach((r) => {
        r.rotation.y = elapsed.current * 38;
      });
    if (spray.current) spray.current.visible = s.spray;
  });
  if (!segments.length) return null;
  return (
    <group>
      {segments.map((s, i) => (
        <Line
          key={i}
          points={[s.a, s.b]}
          color={s.spray ? "#508cb8" : "#acbbc7"}
          lineWidth={s.spray ? 1.4 : 0.8}
          transparent
          opacity={0.5}
          dashed={!s.spray}
          dashSize={1}
          gapSize={1}
        />
      ))}
      <group ref={root} scale={1.25}>
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.65, 2.3]} />
          <meshStandardMaterial
            color="#ebf0f4"
            metalness={0.55}
            roughness={0.27}
          />
        </mesh>
        <mesh position={[0, -0.65, 0]}>
          <boxGeometry args={[1.2, 1, 1.5]} />
          <meshStandardMaterial color="#749aac" roughness={0.35} />
        </mesh>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <group key={`${x}${z}`}>
              <Line
                points={[
                  [0, 0, 0],
                  [x * 2.3, 0.05, z * 2],
                ]}
                color="#43596c"
                lineWidth={4}
              />
              <mesh position={[x * 2.3, 0.1, z * 2]}>
                <cylinderGeometry args={[0.28, 0.28, 0.35, 16]} />
                <meshStandardMaterial color="#374958" metalness={0.7} />
              </mesh>
            </group>
          )),
        )}
        <group ref={rotors}>
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <group key={`${x}${z}`} position={[x * 2.3, 0.34, z * 2]}>
                <mesh>
                  <boxGeometry args={[2.8, 0.035, 0.18]} />
                  <meshStandardMaterial color="#8195a6" />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[1.4, 32]} />
                  <meshBasicMaterial
                    color="#a5b9c8"
                    transparent
                    opacity={0.14}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            )),
          )}
        </group>
        <group ref={spray}>
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.8, -3.4, 0]}>
              <coneGeometry args={[1.35, 5, 20, 1, true]} />
              <meshBasicMaterial
                color="#83c7df"
                transparent
                opacity={0.16}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((k) => (
          <Line
            key={k}
            points={[
              [k * 0.9, -0.4, -0.8],
              [k * 1.2, -1.4, -0.8],
              [k * 1.2, -1.4, 0.9],
            ]}
            color="#718695"
            lineWidth={2}
          />
        ))}
      </group>
    </group>
  );
}
export default function WorldLayers({
  scene,
  geom,
  demo,
}: {
  scene: Scene;
  geom: Geometry;
  demo: DemoScene;
}) {
  return (
    <group>
      {demo.stage >= 3 && (
        <>
          {demo.study?.greenhouses.map((s, i) => (
            <Glasshouse key={s.id} site={s} scene={scene} index={i} />
          ))}
          {demo.buildKey > 0 && <Infrastructure scene={scene} geom={geom} />}
        </>
      )}
      {demo.study && demo.chapter === "light" && (
        <SunStudy scene={scene} geom={geom} demo={demo} />
      )}
      {demo.study && demo.stage >= 5 && demo.chapter === "drone" && (
        <Drone scene={scene} demo={demo} />
      )}
    </group>
  );
}
