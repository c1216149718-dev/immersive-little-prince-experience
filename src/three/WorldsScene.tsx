import { useTexture } from "@react-three/drei";
import { useEffect,useMemo,useRef } from "react";
import { useFrame,useThree } from "@react-three/fiber";
import * as THREE from "three";
import { world,smooth } from "../state";
import { hash,glowTexture } from "./util";
import { WorldModels } from "./WorldModel";
import { useStageAssets } from "./StageAssets";
import { StageCurtain } from "./StageCurtain";
import { FoxDepthOfField } from "./FoxDepthOfField";
import { StageScenery } from "./StageScenery";
import { StageLighting } from "./StageLighting";
import { STAGE,stageIndex,stagePhase,stageX } from "./stageMotion";
export const WORLDS_ORIGIN=new THREE.Vector3(0,300,0);

function StageBoard(){
  const map=useMemo(()=>{
    const c=document.createElement("canvas");c.width=2048;c.height=1024;const ctx=c.getContext("2d")!;
    ctx.fillStyle="#101823";ctx.fillRect(0,0,2048,1024);
    for(let i=0;i<180000;i++){
      const v=hash(i*1.77);ctx.fillStyle=v>.5?"rgba(184,137,70,.04)":"rgba(0,0,0,.12)";
      ctx.fillRect(hash(i*2.73)*2048,hash(i*3.91)*1024,1+v*3,1);
    }
    for(let i=0;i<300;i++){
      ctx.fillStyle=i%4===0?"#d8b56d":"#8f7144";ctx.beginPath();ctx.arc(hash(i*5.13)*2048,hash(i*8.29)*1024,.7+hash(i*2.1)*1.9,0,Math.PI*2);ctx.fill();
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  },[]);
  useEffect(()=>()=>map.dispose(),[map]);
  return <mesh name="StageStarBoard" position={[0,1,-7]}><planeGeometry args={[32,17]}/><meshBasicMaterial map={map}/></mesh>;
}
function BrightStarBridge(){
  const {camera}=useThree();
  const light=useRef<THREE.PointLight>(null!),disc=useRef<THREE.Mesh>(null!),halo=useRef<THREE.Sprite>(null!),wash=useRef<THREE.Mesh>(null!);
  const glow=useMemo(()=>glowTexture(256,"rgba(255,217,140,1)","rgba(255,180,90,0)",1.4),[]);
  useEffect(()=>()=>glow.dispose(),[glow]);
  useFrame(()=>{
    const t=world.t,k=smooth(STAGE.starStart,8.62,t);
    disc.current.visible=k>0&&t<9;light.current.intensity=85*k*(1-smooth(8.995,9.12,t));
    disc.current.scale.setScalar(.72*k);
    halo.current.visible=disc.current.visible;
    (halo.current.material as THREE.SpriteMaterial).opacity=.42*k;
    const opacity=smooth(8.89,8.995,t)*(1-smooth(9.025,9.24,t));
    wash.current.visible=opacity>0;wash.current.position.copy(camera.position);wash.current.quaternion.copy(camera.quaternion);wash.current.translateZ(-.2);
    (wash.current.material as THREE.MeshBasicMaterial).opacity=opacity;
  });
  return <>
    <group position={[2.6,300.2,-1]}>
      <pointLight ref={light} name="BrightStarSource" color="#ffc16d" distance={22} decay={2}/>
      <sprite ref={halo} scale={[4,4,1]}><spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending}/></sprite>
      <mesh name="StageBrightStar" ref={disc}>
        <sphereGeometry args={[1,48,32]}/>
        <shaderMaterial vertexShader={`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
          fragmentShader={`varying vec3 vP;void main(){float n=sin(vP.x*17.+sin(vP.y*13.))*sin(vP.y*23.+vP.z*9.);float broad=sin(vP.x*6.+vP.y*8.);gl_FragColor=vec4(mix(vec3(.68,.32,.07),vec3(1.,.79,.36),.65+broad*.17+n*.09),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`}/>
      </mesh>
    </group>
    <mesh name="BrightStarLightBridge" ref={wash} renderOrder={1000} frustumCulled={false}><planeGeometry args={[2,2]}/><meshBasicMaterial color="#ffdc9c" toneMapped={false} transparent depthWrite={false} depthTest={false}/></mesh>
  </>;
}
export function WorldsScene(){
  const {camera}=useThree();const assets=useStageAssets();
  const focus=useMemo(()=>new THREE.Vector3(1.3,300,0),[]);
  const floorMap=useTexture(import.meta.env.BASE_URL+"textures/worlds-stage/v2/stage/floor/wood.png");
  floorMap.colorSpace=THREE.SRGBColorSpace;floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(2,2);floorMap.anisotropy=8;
  const root=useRef<THREE.Group>(null!),breath=useRef(0);

  useFrame((_,dt)=>{
    if(!world.playbackPaused)breath.current+=Math.min(dt,.05);
    const t=world.t;root.current.visible=t>=5&&t<9;
    if(t<5||t>=9)return;
    const k=smooth(STAGE.pushStart,STAGE.pushEnd,t),lens=camera as THREE.PerspectiveCamera;
    lens.fov=42;lens.updateProjectionMatrix();
    const p=stagePhase(t,stageIndex(t)),performance=smooth(.12,.4,p)*(1-smooth(.70,.96,p));
    focus.set(THREE.MathUtils.lerp(stageX(p),2.6,k),THREE.MathUtils.lerp(301.6,300.2,k),-k);
    const drift=world.reducedMotion?0:Math.sin(breath.current*.4)*.014;
    camera.position.set(2.6*k+(1-k)*(.09*performance+drift),300.8-.6*k,15-15.25*k-.16*performance*(1-k));
    camera.lookAt(2.6*k,300.65-.45*k,-k);
    camera.updateMatrixWorld();
  },-.1);
  return <>
    <group ref={root} name="WorldsStage" position={WORLDS_ORIGIN}>
      <StageLighting/>
      <StageBoard/>
      <mesh receiveShadow name="StageFloor" position={[0,-3.2,-.5]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[28,16]}/><meshStandardMaterial map={floorMap} bumpMap={floorMap} bumpScale={.018} roughness={.67} metalness={.08}/></mesh>

      <WorldModels assets={assets}/>
      <StageScenery assets={assets}/>
      <StageCurtain/>
    </group>
    <BrightStarBridge/>
    <FoxDepthOfField focus={focus} interval={[5.38,5.60,8.87,8.98]} nearRadius={5.5}/>
  </>;
}



