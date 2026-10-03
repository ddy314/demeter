import { memo } from "react";
import {
  Component,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  Line,
  ContactShadows,
} from "@react-three/drei";
import * as THREE from "three";
import { Droplets, MoveUpRight, X, Box, TreePine } from "lucide-react";
import type { Scene, Geometry, Plan, TreeNode, SolverFrame } from "./types";
import Terrain from "./scene/Terrain";
import GroundDetail from "./scene/GroundDetail";
import Trees from "./scene/Trees";
import Network, { Corridors, type PipePick } from "./scene/Network";
import { xyz } from "./scene/model";
import WorldLayers from "./demo/WorldLayers";
import { ConstructionClock, Assemble, Survey } from "./demo/Construction";
import type { DemoScene, Shot } from "./demo/types";
type Props = {
  scene: Scene;
  geom: Geometry;
  plan?: Plan;
  frame?: SolverFrame;
  pressure: boolean;
  reset: number;
  clay: boolean;
  flow: boolean;
  solving: boolean;
  replaying: boolean;
  progress: number;
  cameraMode: "perspective" | "top";
  demo?: DemoScene;
  renderDriver?: ReactNode;
};
type Pick = TreeNode | PipePick;
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
function RenderSchedule({
  active,
  revision,
}: {
  active: boolean;
  revision: unknown;
}) {
  const { invalidate, gl } = useThree();
  const lastShadow = useRef(-1);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [active, revision, invalidate, gl]);
  useFrame(({ clock }) => {
    if (active) {
      invalidate();
      // Geometry evolves more slowly than the camera and flow animation.
      if (clock.elapsedTime - lastShadow.current > 1 / 20) {
        gl.shadowMap.needsUpdate = true;
        lastShadow.current = clock.elapsedTime;
      }
    }
  });
  return null;
}
function Camera({
  scene,
  reset,
  mode,
  focus,
  shot,
}: {
  scene: Scene;
  reset: number;
  mode: Props["cameraMode"];
  focus?: TreeNode;
  shot?: Shot;
}) {
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsType>(null);
  const dest = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3(0, scene.rise * 0.42, 0));
  const moving = useRef(false);
  useLayoutEffect(() => {
    const scale = Math.max(scene.width / 120, scene.depth / 78, 0.75);
    if (shot) {
      target.current.set(...shot.target);
      dest.current.set(...shot.position);
    } else if (focus) {
      target.current.copy(xyz(scene, [focus.x, focus.y, focus.z + 1]));
      dest.current.copy(target.current).add(new THREE.Vector3(17, 13, 21));
    } else {
      target.current.set(0, scene.rise * 0.42, 0);
      dest.current.set(
        ...(mode === "top"
          ? ([0, 170 * scale, 0.05] as [number, number, number])
          : ([92 * scale, 100 * scale, 120 * scale] as [
              number,
              number,
              number,
            ])),
      );
    }
    moving.current = true;
    invalidate();
  }, [scene, reset, mode, focus, shot]);
  useFrame((_, dt) => {
    if (moving.current && controls.current) {
      invalidate();
      const blend = 1 - Math.exp(-Math.min(dt, 0.05) * (shot ? 1.35 : 4));
      camera.position.lerp(dest.current, blend);
      controls.current.target.lerp(target.current, blend);
      controls.current.update();
      if (camera.position.distanceTo(dest.current) < 0.03)
        moving.current = false;
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!shot}
      target={[0, scene.rise * 0.42, 0]}
      minDistance={9}
      maxDistance={350}
      maxPolarAngle={Math.PI * 0.48}
      enableDamping
      dampingFactor={0.07}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}

function Selection({
  scene,
  node,
  hover,
}: {
  scene: Scene;
  node?: TreeNode;
  hover: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ring.current) {
      const target = hover ? 1 : 1.12;
      ring.current.scale.lerp(
        new THREE.Vector3(target, target, target),
        1 - Math.exp(-dt * 7),
      );
    }
  });
  if (!node) return null;
  const p = xyz(scene, [node.x, node.y, node.z - 1.35]);
  return (
    <group position={p}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 2.58, 64]} />
        <meshBasicMaterial
          color="#168bde"
          transparent
          opacity={hover ? 0.45 : 0.9}
          depthWrite={false}
        />
      </mesh>
      {!hover && (
        <>
          <Line
            points={[
              [0, 0, 0],
              [0, 7, 0],
            ]}
            dashed
            dashSize={0.18}
            gapSize={0.2}
            lineWidth={1}
            color="#258bd1"
          />
          <mesh position={[0, 7, 0]}>
            <sphereGeometry args={[0.17, 12, 8]} />
            <meshBasicMaterial color="#0879d0" />
          </mesh>
        </>
      )}
    </group>
  );
}
function PumpStation({ scene, geom }: { scene: Scene; geom: Geometry }) {
  const base = xyz(scene, [geom.source.x, geom.source.y, geom.source.z - 1.5]);
  return (
    <group position={base}>
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[5, 0.3, 4]} />
        <meshStandardMaterial color="#bec9cc" roughness={0.8} />
      </mesh>
      <mesh position={[-1.2, 1.8, 0]} castShadow>
        <cylinderGeometry args={[1.15, 1.15, 3.2, 32]} />
        <meshStandardMaterial
          color="#cbdde3"
          metalness={0.62}
          roughness={0.26}
        />
      </mesh>
      {[0.5, 2.8].map((y) => (
        <mesh key={y} position={[-1.2, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.16, 0.05, 6, 32]} />
          <meshStandardMaterial
            color="#7e969f"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
      <mesh position={[-1.2, 3.44, 0]}>
        <cylinderGeometry args={[0.97, 1.15, 0.16, 32]} />
        <meshStandardMaterial
          color="#e5ebed"
          metalness={0.65}
          roughness={0.23}
        />
      </mesh>
      <mesh position={[1.25, 0.9, 0]} castShadow>
        <boxGeometry args={[1.8, 1.4, 2.1]} />
        <meshStandardMaterial
          color="#f1f4f5"
          roughness={0.36}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[1.25, 1.3, 1.07]}>
        <boxGeometry args={[0.9, 0.43, 0.04]} />
        <meshStandardMaterial color="#1c3443" roughness={0.2} />
      </mesh>
      <mesh position={[1.55, 1.31, 1.1]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#54dbb7" />
      </mesh>
      <mesh position={[0, 0.8, 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 2, 12]} />
        <meshStandardMaterial color="#4589b4" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}
function Sweep({
  progress,
  scene,
  active,
}: {
  progress: number;
  scene: Scene;
  active: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current)
      ref.current.position.z = THREE.MathUtils.damp(
        ref.current.position.z,
        scene.depth / 2 - (scene.depth * progress) / 100,
        6,
        dt,
      );
  });
  return active ? (
    <group ref={ref}>
      <mesh position={[0, scene.rise * 0.5, 0]}>
        <planeGeometry args={[scene.width, scene.rise + 14]} />
        <meshBasicMaterial
          color="#2d9fe0"
          transparent
          opacity={0.035}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[
          [-scene.width / 2, -3.3, 0],
          [scene.width / 2, -3.3, 0],
        ]}
        color="#3c9bd8"
        lineWidth={1.2}
        transparent
        opacity={0.5}
      />
    </group>
  ) : null;
}
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="canvas-fallback">
        3D rendering could not start. Enable browser hardware acceleration and
        reload. The parameter editor and solver are still available.
      </div>
    ) : (
      this.props.children
    );
  }
}
function Scene3D(props: Props) {
  const {
    scene,
    geom,
    plan,
    frame,
    clay,
    pressure,
    flow,
    solving,
    replaying,
    progress,
  } = props;
  const demo = props.demo;
  const sunSample = demo?.study?.light.sun_samples.reduce((best, s) =>
    Math.abs(s.hour - demo.sunHour) < Math.abs(best.hour - demo.sunHour)
      ? s
      : best,
  );
  const [picked, setPicked] = useState<Pick>(),
    [hover, setHover] = useState<TreeNode>(),
    [zone, setZone] = useState(0),
    [focus, setFocus] = useState<TreeNode>();
  useEffect(
    () => setFocus(undefined),
    [geom, props.reset, props.cameraMode, solving, replaying],
  );
  const current =
      frame?.candidate || (!solving && !replaying ? plan : undefined),
    zones = current?.zones || 1;
  useEffect(() => {
    setPicked(undefined);
    setHover(undefined);
  }, [geom, solving, replaying, current?.id]);
  useEffect(() => {
    setZone(0);
    if (!flow || props.renderDriver) return;
    const timer = setInterval(() => setZone((z) => (z + 1) % zones), 3200);
    return () => clearInterval(timer);
  }, [zones, flow, props.renderDriver]);
  const isPipe = (p: Pick): p is PipePick => "kind" in p;
  const pickedNode = picked && !isPipe(picked) ? picked : undefined;
  const pressures =
    frame?.pressures || (!solving && !replaying ? plan?.pressures : undefined);
  const setHighlight = useCallback((n?: TreeNode) => {
    setHover(n);
    document.body.style.cursor = n ? "pointer" : "auto";
  }, []);
  return (
    <div
      className="scene-root"
      data-network-phase={
        solving
          ? "solving"
          : replaying
            ? "replay"
            : plan
              ? "complete"
              : "terrain"
      }
      data-candidate={current?.id || ""}
      data-animation={flow ? "flow" : "paused"}
    >
      <RenderBoundary>
        <Canvas
          shadows
          frameloop={props.renderDriver ? "never" : "demand"}
          camera={{ position: [105, 115, 135], fov: 36, near: 0.1, far: 900 }}
          dpr={props.renderDriver ? 1 : [1, 1.5]}
          gl={{
            antialias: true,
            preserveDrawingBuffer: !!props.renderDriver,
            localClippingEnabled: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.02,
          }}
          onPointerMissed={() => setPicked(undefined)}
        >
          {!props.renderDriver && (
            <RenderSchedule
              active={demo ? demo.playing : flow || solving || replaying}
              revision={demo || plan || geom}
            />
          )}
          <color attach="background" args={["#f3f5f7"]} />
          <fog attach="fog" args={["#f3f5f7", 240, 520]} />
          <ambientLight intensity={0.3} />
          <hemisphereLight args={["#d5e9ff", "#d8c3a5", 0.8]} />
          <directionalLight
            position={
              demo?.chapter === "light" && sunSample
                ? [
                    sunSample.vector[0] * 130,
                    sunSample.vector[2] * 130,
                    -sunSample.vector[1] * 130,
                  ]
                : [-40, 100, 55]
            }
            intensity={2.5}
            color="#fff4e5"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-100}
            shadow-camera-right={100}
            shadow-camera-top={100}
            shadow-camera-bottom={-100}
            shadow-camera-far={250}
            shadow-normalBias={0.18}
            shadow-bias={-0.00015}
          />
          <directionalLight
            position={[60, 40, -50]}
            intensity={0.7}
            color="#daeaff"
          />
          <Environment resolution={128}>
            <Lightformer
              position={[0, 100, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[150, 150, 1]}
              intensity={1.0}
            />
            <Lightformer
              position={[-100, 40, 20]}
              rotation={[0, Math.PI / 2, 0]}
              scale={[80, 120, 1]}
              intensity={1.2}
              color="#e1edff"
            />
          </Environment>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -3.7, 0]}
            receiveShadow
          >
            <planeGeometry args={[900, 900]} />
            <meshStandardMaterial color="#f2f4f6" roughness={0.9} />
          </mesh>
          <ConstructionClock demo={demo}>
            <Terrain scene={scene} geom={geom} clay={clay} />
            <Assemble start={9.3} duration={0.7}>
              <GroundDetail scene={scene} clay={clay} />
            </Assemble>
            <Trees
              scene={scene}
              geom={geom}
              clay={clay}
              onPick={setPicked}
              onHover={setHighlight}
            />
            {(!demo || demo.stage >= 4) && (
              <>
                <Assemble start={17} duration={0.6}>
                  <PumpStation scene={scene} geom={geom} />
                </Assemble>
                <Corridors
                  scene={scene}
                  geom={geom}
                  active={(solving || replaying) && !frame}
                />
                <Network
                  scene={scene}
                  geom={geom}
                  plan={solving || replaying ? undefined : plan}
                  frame={frame}
                  pressure={(!demo?.building && pressure) || !!frame}
                  flow={
                    flow &&
                    !!current &&
                    (!demo?.building || demo.buildTime >= 23)
                  }
                  construction={demo?.building}
                  zone={zone}
                  onPick={setPicked}
                  selected={picked && isPipe(picked) ? picked.id : undefined}
                />
              </>
            )}
            {demo && (
              <>
                <Survey scene={scene} geom={geom} demo={demo} />
                <WorldLayers scene={scene} geom={geom} demo={demo} />
              </>
            )}
          </ConstructionClock>
          <Selection
            scene={scene}
            node={pickedNode || hover}
            hover={!pickedNode}
          />
          <Sweep
            scene={scene}
            progress={progress}
            active={solving || replaying}
          />
          {!demo && (
            <ContactShadows
              position={[0, -3.65, 0]}
              opacity={0.2}
              scale={230}
              blur={2.8}
              far={85}
              resolution={512}
              frames={1}
            />
          )}
          {props.renderDriver || (
            <Camera
              scene={scene}
              reset={props.reset}
              mode={props.cameraMode}
              focus={focus}
              shot={demo?.shot}
            />
          )}
        </Canvas>
      </RenderBoundary>
      {!demo && (
        <div className="scene-badge">
          <span className="live-signal" />
          <span>
            {solving
              ? "Live checks"
              : replaying
                ? "Replay"
                : flow && plan
                  ? "Water flow"
                  : "3D scene"}
          </span>
          {current && <b>{current.id}</b>}
        </div>
      )}
      {!demo && current && flow && (
        <div className="zone-indicator">
          <Droplets size={13} />
          <span>Irrigation zones</span>
          <b>
            {zone + 1}
            <small> / {zones}</small>
          </b>
          <div className="zone-ticks">
            {Array.from({ length: zones }, (_, i) => (
              <i key={i} className={i === zone ? "active" : ""} />
            ))}
          </div>
        </div>
      )}
      {picked && (
        <div className="selection-card" key={picked.id}>
          <div className="selection-header">
            <span>
              {isPipe(picked) ? <Box size={15} /> : <TreePine size={15} />}{" "}
              {isPipe(picked) ? "Pipe" : "Tree"} · {picked.id}
            </span>
            <button
              aria-label="Close selection"
              onClick={() => setPicked(undefined)}
            >
              <X size={15} />
            </button>
          </div>
          {isPipe(picked) ? (
            <>
              <strong>
                {picked.diameter}
                <small> mm</small>
              </strong>
              <p>Internal diameter</p>
              <div className="selection-metrics">
                <span>
                  Pipe length <b>{picked.length.toFixed(1)} m</b>
                </span>
                <span>
                  End node <b>{picked.node}</b>
                </span>
              </div>
            </>
          ) : (
            <>
              <strong>
                {pressures?.[picked.id]?.toFixed(3) || "—"}
                <small> MPa</small>
              </strong>
              <p>Active zone · Emitter pressure</p>
              <div className="selection-metrics">
                <span>
                  Ground elevation <b>{(picked.z - 1.5).toFixed(1)} m</b>
                </span>
                <span>
                  Node flow{" "}
                  <b>
                    {(frame?.outflows_lpm || plan?.outflows_lpm)?.[
                      picked.id
                    ]?.toFixed(2) || "—"}{" "}
                    L/min
                  </b>
                </span>
              </div>
            </>
          )}
          {pickedNode && (
            <button
              className="focus-button"
              onClick={() => setFocus(focus ? undefined : pickedNode)}
            >
              <MoveUpRight size={12} />
              {focus ? "Overview" : "Inspect"}
            </button>
          )}
          <div className="selection-foot">Current plan data</div>
        </div>
      )}
    </div>
  );
}

export default memo(Scene3D);
