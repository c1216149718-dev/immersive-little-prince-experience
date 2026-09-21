import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

export type ModelName = "b612" | "prince" | "fox" | "rose" | "rose-petal-split";

/** Every visual owns its skeleton. Controllers never address GLB nodes. */
export function useModel(name: ModelName) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/${name}.glb`);
  return useMemo(() => {
    const scene = clone(gltf.scene);
    const bones: Record<string, THREE.Bone> = {};
    scene.traverse((object) => {
      if (object instanceof THREE.Bone) bones[object.name] = object;
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        // Animated bounds are deliberately conservative; no stale static culling.
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      }
    });
    return { scene, bones, clips: gltf.animations };
  }, [gltf]);
}

export function ModelAsset({ name }: { name: ModelName }) {
  const model = useModel(name);
  return <primitive object={model.scene} dispose={null} />;
}
