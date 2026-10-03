import { memo } from "react";
import { useMemo, useLayoutEffect, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Scene, Geometry, TreeNode } from "../types";
import { useAssemblyTime } from "../demo/Construction";
import { treeAnimation } from "./treeAnimation";
import { random, xyz, leafGeometry } from "./model";
const BRANCHES = 8,
  FRUIT = 7;
function Trees({
  scene,
  geom,
  clay,
  onPick,
  onHover,
}: {
  scene: Scene;
  geom: Geometry;
  clay: boolean;
  onPick: (n: TreeNode) => void;
  onHover: (n?: TreeNode) => void;
}) {
  // Larger fields use fewer, slightly wider leaves to preserve canopy coverage.
  const LEAVES = geom.nodes.length > 180 ? 160 : 260;
  const time = useAssemblyTime();
  const growth = useMemo(() => ({ value: 100 }), []);
  const ranks = useMemo(() => {
    const sorted = geom.nodes
      .map((n, i) => ({ n, i }))
      .sort((a, b) => a.n.y - b.n.y || a.n.x - b.n.x);
    const result: number[] = [];
    sorted.forEach((v, rank) => (result[v.i] = rank));
    return result;
  }, [geom]);
  const hits = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null),
    wood = useRef<THREE.InstancedMesh>(null),
    fruit = useRef<THREE.InstancedMesh>(null);
  const wind = useMemo(() => ({ value: 0 }), []);
  const leaf = useMemo(() => leafGeometry(), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.79,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWind;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed.x+=sin(uWind*.9+instanceMatrix[3].x*.35+instanceMatrix[3].z*.31)*.09*(position.y+.6);\n#endif`,
        );
    };
    treeAnimation(m, growth);
    return m;
  }, [wind, growth]);
  const woodMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: clay ? "#8aa3ae" : "#6d5139",
      roughness: 0.96,
    });
    treeAnimation(m, growth);
    return m;
  }, [clay, growth]);
  const fruitMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: clay ? "#c3d0d4" : "#b66735",
      roughness: 0.53,
    });
    treeAnimation(m, growth);
    return m;
  }, [clay, growth]);
  const depthMaterial = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    treeAnimation(m, growth);
    return m;
  }, [growth]);
  useEffect(
    () => () => {
      woodMaterial.dispose();
      fruitMaterial.dispose();
      depthMaterial.dispose();
    },
    [woodMaterial, fruitMaterial, depthMaterial],
  );
  useFrame((state) => {
    wind.value = state.clock.elapsedTime;
    growth.value = time.current;
    if (hits.current) hits.current.visible = time.current >= 9.4;
  });
  useEffect(
    () => () => {
      leaf.dispose();
      mat.dispose();
    },
    [leaf, mat],
  );
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D(),
      up = new THREE.Vector3(0, 1, 0);
    const rng = random(scene.seed);
    geom.nodes.forEach((n, i) => {
      const base = xyz(scene, [n.x, n.y, n.z - 1.5]),
        scale = 0.9 + rng() * 0.27,
        turn = rng() * Math.PI * 2;
      // A woody branching structure, with seeded leaf whorls around each branch.
      dummy.position.copy(base).add(new THREE.Vector3(0, 3.2 * scale, 0));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      hits.current?.setMatrixAt(i, dummy.matrix);
      const ends: THREE.Vector3[] = [];
      for (let b = 0; b < BRANCHES; b++) {
        const phi = turn + b * 2.3999;
        const start =
          b === 0
            ? base.clone().add(new THREE.Vector3(0, -0.15, 0))
            : base.clone().add(new THREE.Vector3(0, 1.0 + b * 0.19, 0));
        const end =
          b === 0
            ? base.clone().add(new THREE.Vector3(0.08, 3.4 * scale, 0.08))
            : base
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.cos(phi) * (1.0 + rng() * 0.8) * scale,
                    (2.5 + rng() * 1.3) * scale,
                    Math.sin(phi) * (1.0 + rng() * 0.8) * scale,
                  ),
                );
        const d = end.clone().sub(start);
        dummy.position.copy(start).addScaledVector(d, 0.5);
        dummy.quaternion.setFromUnitVectors(up, d.clone().normalize());
        dummy.scale.set(
          b === 0 ? 0.22 : 0.075,
          d.length(),
          b === 0 ? 0.22 : 0.075,
        );
        dummy.updateMatrix();
        wood.current?.setMatrixAt(i * BRANCHES + b, dummy.matrix);
        ends.push(end);
      }
      for (let j = 0; j < LEAVES; j++) {
        const c = ends[1 + (j % (BRANCHES - 1))],
          phi = rng() * Math.PI * 2,
          cost = rng() * 2 - 1,
          radius = Math.cbrt(rng()) * (0.8 + rng() * 0.45) * scale;
        const sint = Math.sqrt(1 - cost * cost);
        dummy.position
          .copy(c)
          .add(
            new THREE.Vector3(
              Math.cos(phi) * sint * radius,
              cost * radius * 0.95 + 0.18,
              Math.sin(phi) * sint * radius,
            ),
          );
        dummy.rotation.set(rng() * Math.PI, phi, rng() * Math.PI);
        const l = (0.63 + rng() * 0.57) * Math.sqrt(260 / LEAVES);
        dummy.scale.set(l, l, 1);
        dummy.updateMatrix();
        leaves.current?.setMatrixAt(i * LEAVES + j, dummy.matrix);
        const col = new THREE.Color(
          clay
            ? ["#b8cbd2", "#9eb7c1", "#d0dde1"][j % 3]
            : ["#425e30", "#577d3e", "#72934d", "#365531", "#8b9e5e"][
                Math.floor(rng() * 5)
              ],
        );
        leaves.current?.setColorAt(i * LEAVES + j, col);
      }
      for (let j = 0; j < FRUIT; j++) {
        dummy.position
          .copy(ends[1 + (j % (BRANCHES - 1))])
          .add(
            new THREE.Vector3(
              (rng() - 0.5) * 0.65,
              -0.25 - rng() * 0.35,
              (rng() - 0.5) * 0.65,
            ),
          );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.11 + rng() * 0.06);
        dummy.updateMatrix();
        fruit.current?.setMatrixAt(i * FRUIT + j, dummy.matrix);
      }
    });
    [wood, leaves, fruit].forEach((r, m) => {
      const perTree = [BRANCHES, LEAVES, FRUIT][m];
      const data = new Float32Array(geom.nodes.length * perTree * 4);
      geom.nodes.forEach((n, i) => {
        const base = xyz(scene, [n.x, n.y, n.z - 1.5]);
        for (let j = 0; j < perTree; j++)
          data.set(
            [base.x, base.y, base.z, 5 + (ranks[i] / geom.nodes.length) * 3.5],
            (i * perTree + j) * 4,
          );
      });
      r.current!.geometry.setAttribute(
        "aTreeOrigin",
        new THREE.InstancedBufferAttribute(data, 4),
      );
    });
    for (const ref of [leaves, wood, fruit, hits])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor)
          ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
  }, [scene, geom, clay]);
  return (
    <group>
      <instancedMesh
        ref={wood}
        args={[undefined, woodMaterial, geom.nodes.length * BRANCHES]}
        customDepthMaterial={depthMaterial}
        castShadow
      >
        <cylinderGeometry args={[0.65, 1, 1, 7]} />
      </instancedMesh>
      <instancedMesh
        ref={leaves}
        args={[leaf, mat, geom.nodes.length * LEAVES]}
        customDepthMaterial={depthMaterial}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={hits}
        args={[undefined, undefined, geom.nodes.length]}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onHover(geom.nodes[e.instanceId]);
        }}
        onPointerOut={() => onHover(undefined)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onPick(geom.nodes[e.instanceId]);
        }}
      >
        <sphereGeometry args={[2.3, 8, 6]} />
        <meshBasicMaterial visible={false} />
      </instancedMesh>
      <instancedMesh
        ref={fruit}
        args={[undefined, fruitMaterial, geom.nodes.length * FRUIT]}
        customDepthMaterial={depthMaterial}
        castShadow
      >
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
    </group>
  );
}

export default memo(Trees);
