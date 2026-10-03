import { memo } from "react";
import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { Scene, Geometry } from "../types";
import { useFrame } from "@react-three/fiber";
import { useAssemblyTime } from "../demo/Construction";
import { fraction } from "../demo/timeline";
import { elevation, xyz } from "./model";
function Terrain({
  scene,
  geom,
  clay,
}: {
  scene: Scene;
  geom: Geometry;
  clay: boolean;
}) {
  const time = useAssemblyTime();
  const clip = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), -scene.depth / 2),
    [scene.depth],
  );
  useFrame(() => {
    clip.constant =
      -scene.depth / 2 + (scene.depth + 1) * fraction(time.current, 0.4, 4.2);
  });
  const surface = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = [];
    for (let i = 0; i < geom.mesh.length; i += 3)
      a.push(...xyz(scene, geom.mesh.slice(i, i + 3)).toArray());
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  }, [geom, scene]);
  const sides = useMemo(() => {
    const a: number[] = [];
    scene.boundary.forEach((p, i) => {
      const q = scene.boundary[(i + 1) % scene.boundary.length];
      for (let k = 0; k < 80; k++) {
        const point = (t: number) => {
          const x = (p[0] + (q[0] - p[0]) * t) * scene.width,
            y = (p[1] + (q[1] - p[1]) * t) * scene.depth;
          return xyz(scene, [x, y, elevation(scene, y)]);
        };
        const A = point(k / 80),
          B = point((k + 1) / 80),
          C = new THREE.Vector3(A.x, -3.5, A.z),
          D = new THREE.Vector3(B.x, -3.5, B.z);
        a.push(
          ...A.toArray(),
          ...C.toArray(),
          ...B.toArray(),
          ...B.toArray(),
          ...C.toArray(),
          ...D.toArray(),
        );
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  }, [scene]);
  const surfaceMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: clay ? "#e7eced" : "#b2b299",
      roughness: 0.93,
      clippingPlanes: [clip],
      clipShadows: true,
      side: THREE.DoubleSide,
    });
    if (!clay)
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vLand;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvLand=position;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying vec3 vLand;\nfloat grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
 float fine=grain(vLand.xz*18.0), coarse=grain(floor(vLand.xz*1.8));
 float row=abs(mod(${(scene.depth / 2).toFixed(4)}-vLand.z,${scene.row_spacing.toFixed(4)})-${(scene.row_spacing / 2).toFixed(4)});
 float grass=smoothstep(1.05,2.5,row+coarse*.45);
 float slope=1.0-abs(normalize(vNormal).y);
 vec3 soil=vec3(.24,.19,.125), lawn=vec3(.13,.22,.085);
 vec3 field=mix(soil,lawn,grass);
 diffuseColor.rgb=field*(.86+.24*fine+.12*coarse);
 `,
          );
      };
    return material;
  }, [clay, scene, clip]);
  const sideMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: clay ? "#d3dce0" : "#82725b",
      roughness: 0.98,
      clippingPlanes: [clip],
      clipShadows: true,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCut;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvCut=position;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCut;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat vein=sin(vCut.y*2.8+sin(vCut.x*.17+vCut.z*.21)*.8);\ndiffuseColor.rgb*=.93+vein*.045;",
        );
    };
    return mat;
  }, [clay, clip]);
  useEffect(
    () => () => {
      surface.dispose();
      sides.dispose();
      surfaceMaterial.dispose();
      sideMaterial.dispose();
    },
    [surface, sides, surfaceMaterial, sideMaterial],
  );
  const rings = useMemo(
    () =>
      [scene.boundary, ...scene.exclusions].map((r) =>
        r.flatMap((a, i) => {
          const b = r[(i + 1) % r.length];
          return Array.from({ length: 30 }, (_, j) => {
            const x = (a[0] + ((b[0] - a[0]) * j) / 29) * scene.width,
              y = (a[1] + ((b[1] - a[1]) * j) / 29) * scene.depth;
            return xyz(scene, [x, y, elevation(scene, y) + 0.09]).toArray() as [
              number,
              number,
              number,
            ];
          });
        }),
      ),
    [scene],
  );
  return (
    <group>
      <mesh geometry={surface} material={surfaceMaterial} receiveShadow />
      <mesh geometry={sides} material={sideMaterial} receiveShadow castShadow />
      {rings.map((p, i) => (
        <Line
          key={i}
          points={p}
          color={i ? "#d28862" : "#d2dcd5"}
          lineWidth={i ? 1.5 : 0.7}
          transparent
          opacity={0.7}
          dashed={i > 0}
        />
      ))}
    </group>
  );
}

export default memo(Terrain);
