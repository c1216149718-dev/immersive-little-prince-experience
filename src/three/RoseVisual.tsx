import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useModel } from "./ModelAsset";
import { roseGust, type RoseMotion } from "./roseMotion";
import { world, smooth } from "../state";

/** The original body, with a single petal separated and finished in Blender. */
export function RoseVisual({motion}:{motion:MutableRefObject<RoseMotion>}) {
  const model=useModel("rose-petal-split");
  const intact=useModel("rose");
  const original=useMemo(()=>intact.scene.getObjectByName("rose_visual") as THREE.Mesh,[intact]);
  const body=useMemo(()=>model.scene.getObjectByName('RoseBody') as THREE.Mesh,[model]);
  const wind=useMemo(()=>({value:0}),[]);
  const gust=useMemo(()=>({value:0}),[]);
  const breath=useMemo(()=>({value:0}),[]);
  const material=useMemo(()=>{
    const m=(body.material as THREE.MeshStandardMaterial).clone();
    m.color.multiply(new THREE.Color('#fff0f0'));m.roughness=.46;m.metalness=0;
    m.onBeforeCompile=shader=>{
      shader.uniforms.uRoseGust=gust;shader.uniforms.uRoseWind=wind;shader.uniforms.uRoseBreath=breath;
      shader.vertexShader='uniform float uRoseWind,uRoseBreath,uRoseGust;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float bloom=smoothstep(.55,.75,position.y);
        float leaf=smoothstep(.15,.35,position.y)*(1.-smoothstep(.50,.65,position.y));
        transformed.xz*=1.+bloom*uRoseBreath;
        transformed.z+=leaf*uRoseWind*.055;
        // Root stays planted; the flexible stem and bloom respond to the same gust.
        transformed.x+=pow(max(position.y,0.),2.)*uRoseGust*.012;
        transformed.z+=(leaf*.020+bloom*.004)*uRoseGust;`);
    };
    return m;
  },[body,wind,breath,gust]);
  useEffect(()=>{const previous=body.material,old=original.material;body.material=material;original.material=material;return ()=>{body.material=previous;original.material=old;material.dispose()}},[body,original,material]);
  useFrame(()=>{body.visible=world.t>=4.5&&world.t<5;original.visible=world.t<4.5;
    const life=1-smooth(4.35,4.5,world.t);
    gust.value=world.reducedMotion?0:roseGust(world.t);
    wind.value=motion.current.x*life;
    breath.value=world.reducedMotion?0:Math.sin(motion.current.time*.9)*.004*life;});
  return <group position={[0,-1.35,0]} scale={3} name="RoseModelBody">
    <primitive object={body} dispose={null}/>
    <primitive object={original} dispose={null}/>
  </group>;
}
