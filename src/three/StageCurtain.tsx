import { useEffect,useMemo,useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { world,smooth } from "../state";
import { STAGE } from "./stageMotion";
export function StageCurtain(){
 const gltf=useGLTF(import.meta.env.BASE_URL+"models/stage/velvet-curtain.glb");
 const rig=useMemo(()=>{
  const scene=gltf.scene.clone(true),panels:THREE.Mesh[]=[],materials:THREE.Material[]=[];
  const velvet=new THREE.MeshPhysicalMaterial({color:"#742132",roughness:.94,sheen:1,sheenColor:new THREE.Color("#9a504a"),sheenRoughness:.85});
  velvet.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\nfloat fibre=sin(vViewPosition.x*540.)*sin(vViewPosition.y*740.);diffuseColor.rgb*=.95+.05*fibre;")};materials.push(velvet);
  scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;
   if(o.name.startsWith("Curtain"))panels.push(o);
   if(o.name.startsWith("Valance")||o.name.includes("Gold"))o.position.y-=.6;
   if(!o.name.includes("Gold"))o.material=velvet;
  }});return {scene,panels,materials};
 },[gltf]);
 const wind=useRef({x:0,v:0,last:0,time:0,version:-1});
 useEffect(()=>()=>rig.materials.forEach(m=>m.dispose()),[rig]);
 useFrame((_,raw)=>{
  const dt=Math.min(raw,.033),w=wind.current,t=world.t;
  if(w.version!==world.replayVersion){w.x=w.v=w.time=0;w.last=world.mouse.x;w.version=world.replayVersion}
  if(!world.playbackPaused)w.time+=dt;
  const speed=(world.mouse.x-w.last)/Math.max(dt,.001);w.last=world.mouse.x;
  const force=world.mouseActive&&Math.abs(world.mouse.x)>.65&&!world.reducedMotion?THREE.MathUtils.clamp(speed,-3,3)*.075:0;
  w.v+=(force-w.x*12-w.v*5)*dt;w.x+=w.v*dt;
  rig.panels.forEach((m,i)=>{
   const sign=i===0?-1:1;m.position.x=-sign*.4*smooth(STAGE.curtainStart,STAGE.curtainEnd,world.t);
   ["TopPull","MiddleDrag","HemLag"].forEach((key,j)=>{
    const start=STAGE.curtainStart+j*.018,end=STAGE.curtainEnd+j*.038;
    const a=smooth(start,end,t),q=Math.max(0,(t-end)*10);
    const settle=world.reducedMotion?0:Math.sin(q*8)*Math.exp(-q*4)*.025;
    if(m.morphTargetDictionary&&m.morphTargetInfluences)m.morphTargetInfluences[m.morphTargetDictionary[key]]=Math.min(1.025,a+settle+(j===2&&!world.reducedMotion?w.x*.04:0));
   });
   m.rotation.y=world.reducedMotion?0:sign*(Math.sin(w.time*.48+i)*.003+w.x);
  });
 });return <group name="StageCurtain" position={[0,.6,6]}><primitive object={rig.scene} dispose={null}/></group>;
}
