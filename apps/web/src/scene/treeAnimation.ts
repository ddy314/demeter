import * as THREE from "three";

/** Growth runs after instancing so each tree stays anchored to its own ground. */
export function treeAnimation(
  material: THREE.Material,
  clock: { value: number },
) {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uAssemblyTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      attribute vec4 aTreeOrigin;
      uniform float uAssemblyTime;
      float treeGrowth() {
        float t = clamp((uAssemblyTime - aTreeOrigin.w) / .9, 0.0, 1.0);
        return max(.00001, 1.0 - pow(1.0-t, 3.0));
      }
    `,
      )
      .replace(
        "#include <project_vertex>",
        THREE.ShaderChunk.project_vertex.replace(
          "mvPosition = modelViewMatrix * mvPosition;",
          "mvPosition.xyz = mix(aTreeOrigin.xyz, mvPosition.xyz, treeGrowth());\nmvPosition = modelViewMatrix * mvPosition;",
        ),
      )
      .replace(
        "#include <worldpos_vertex>",
        THREE.ShaderChunk.worldpos_vertex.replace(
          "worldPosition = modelMatrix * worldPosition;",
          "worldPosition.xyz = mix(aTreeOrigin.xyz, worldPosition.xyz, treeGrowth());\nworldPosition = modelMatrix * worldPosition;",
        ),
      );
  };
  material.customProgramCacheKey = () => "tree-anchored-growth-v1";
}
