import { useEffect,useMemo,useRef } from "react";
import { useFrame,useThree } from "@react-three/fiber";
import * as THREE from "three";
import { world,smooth } from "../state";
import { stagePhase,stageX,stageIndex } from "./stageMotion";
const moods=[
 {color:"#ffd298",power:230,angle:.48,penumbra:.55},
 {color:"#ffe0b0",power:260,angle:.41,penumbra:.38},
 {color:"#eeb277",power:160,angle:.52,penumbra:.82},
 {color:"#ffe0b8",power:220,angle:.46,penumbra:.3},
 {color:"#ffc478",power:165,angle:.42,penumbra:.60},
 {color:"#f5d1a1",power:190,angle:.53,penumbra:.72}
];
export function StageLighting(){
 const {gl}=useThree(),spot=useRef<THREE.SpotLight>(null!),front=useRef<THREE.PointLight>(null!),rim=useRef<THREE.PointLight>(null!),house=useRef<THREE.PointLight>(null!),fill=useRef<THREE.HemisphereLight>(null!);
 const target=useMemo(()=>new THREE.Object3D(),[]),soft=useRef<THREE.DirectionalLight>(null!);

 useEffect(()=>{const old=gl.shadowMap.enabled,type=gl.shadowMap.type;gl.shadowMap.enabled=true;gl.shadowMap.type=THREE.PCFSoftShadowMap;return()=>{gl.shadowMap.enabled=old;gl.shadowMap.type=type}},[gl]);
 useFrame(()=>{
  const t=world.t,index=stageIndex(t),p=stagePhase(t,index),m=moods[index];
  const level=smooth(.12,.33,p)*(1-smooth(.73,.84,p))*(1-smooth(8.29,8.43,t));
  const x=THREE.MathUtils.clamp(stageX(p),-6,7);
  target.position.set(x,1.0,0);target.updateMatrixWorld();
  spot.current.position.set(x+1.0,7,5);spot.current.intensity=m.power*level;spot.current.angle=m.angle*(.8+.2*level);spot.current.penumbra=m.penumbra;spot.current.color.set(m.color);
  front.current.position.set(x-1,2,6);front.current.intensity=9*level;
  rim.current.position.set(x+2,3,-2.6);rim.current.intensity=17*level;
  house.current.intensity=(75+30*smooth(5.2,5.6,t))*(1-smooth(8.28,8.60,t));
  fill.current.intensity=.58*(1-smooth(8.3,8.62,t));
  const star=smooth(8.46,8.64,t);
  soft.current.intensity=1.35*(1-smooth(8.3,8.64,t))+.16*star;
  soft.current.color.set(star>0?"#efc18c":"#c4c9d2");
 });
 return <group name="StageLighting">
  <primitive object={target}/>
  <spotLight ref={spot} name="ActorSpotlight" target={target} distance={28} decay={2} castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.00012} shadow-normalBias={.035} shadow-camera-near={.3} shadow-camera-far={30}/>
  <pointLight ref={front} color="#ecd5be" distance={18}/>
  <pointLight ref={rim} color="#ffbf70" distance={14}/>
  <pointLight ref={house} position={[0,3,10]} color="#e4b393" distance={24}/>
  <hemisphereLight ref={fill} color="#91a3c5" groundColor="#38241a"/>
  <directionalLight ref={soft} target={target} position={[0,3,12]} color="#c4c9d2"/>
 </group>;
}

