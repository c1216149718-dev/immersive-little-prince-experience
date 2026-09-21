import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { world,smooth } from "../state";
import { stagePhase } from "./stageMotion";
import { StageCard,type StageAssets,type StageAsset } from "./StageAssets";
type Prop={kind:StageAsset;x:number;y:number;z:number;w:number;from:"top"|"bottom"|"left";angle?:number;delay:number};
export const ROLE_PROPS:Prop[][]=[
 [{kind:"king",x:-2.0,y:1.8,z:.3,w:1.0,from:"top",delay:.03},{kind:"king",x:2.0,y:1.8,z:-.3,w:1.0,from:"top",delay:.06},
 {kind:"star",x:-1.8,y:-.85,z:1.0,w:.65,from:"bottom",delay:.10},{kind:"star-b",x:1.85,y:-.72,z:.6,w:.72,from:"bottom",delay:.13}],

 [{kind:"applause",x:-2.0,y:-.8,z:1,w:1.15,from:"bottom",angle:-.20,delay:0},
 {kind:"applause",x:2.2,y:-.5,z:.4,w:.95,from:"bottom",angle:.18,delay:.04},
 {kind:"applause",x:-2.3,y:2.2,z:-.3,w:.9,from:"top",angle:-.12,delay:.09},
 {kind:"star",x:1.9,y:3.0,z:-.7,w:.7,from:"top",angle:.18,delay:.13},
 {kind:"star-b",x:2.7,y:1.25,z:.2,w:.65,from:"bottom",angle:-.16,delay:.17}],
 [{kind:"bottle",x:-2.05,y:1.8,z:-.1,w:.9,from:"top",angle:-.22,delay:.08},
 {kind:"bottle",x:-2.8,y:.1,z:.3,w:.8,from:"bottom",angle:.24,delay:.15},
 {kind:"bottle",x:-1.8,y:-1.05,z:1,w:.65,from:"bottom",angle:-.30,delay:.19}],
 [{kind:"ledger",x:2.0,y:2.1,z:.2,w:.8,from:"top",delay:0},
 {kind:"ledger",x:3.0,y:2.1,z:-.4,w:.75,from:"top",delay:.03},
 {kind:"ledger",x:2.0,y:.95,z:.25,w:.8,from:"bottom",delay:.06},
 {kind:"ledger",x:3.0,y:.95,z:-.4,w:.75,from:"top",delay:.09},
 {kind:"ledger",x:2.0,y:-.2,z:.3,w:.8,from:"bottom",delay:.12},
 {kind:"ledger",x:-2.0,y:-.7,z:.3,w:1.0,from:"bottom",delay:.15},
 {kind:"star",x:3.0,y:-.4,z:.1,w:.55,from:"bottom",delay:.18}],
 [{kind:"lantern",x:2.35,y:2.5,z:-.1,w:.8,from:"top",delay:.10},
 {kind:"star",x:2.35,y:.8,z:.4,w:.50,from:"bottom",delay:.17},
 {kind:"star-b",x:2.35,y:-.5,z:.7,w:.42,from:"bottom",delay:.23}],
 [{kind:"map",x:-2.25,y:1.55,z:-.35,w:2.0,from:"left",angle:-.04,delay:.04},
 {kind:"map",x:2.5,y:1.7,z:-.55,w:1.75,from:"top",angle:.03,delay:.09},
 {kind:"compass",x:-2.2,y:-.7,z:.5,w:.95,from:"bottom",angle:-.07,delay:.15},
 {kind:"star-b",x:2.6,y:-.9,z:.5,w:.55,from:"bottom",delay:.21}]

];
export function WorldPropBurst({index,assets}:{index:number;assets:StageAssets}){
 const groups=useRef<THREE.Group[]>([]),time=useRef(0),version=useRef(-1);
 useFrame((_,raw)=>{
  if(version.current!==world.replayVersion){version.current=world.replayVersion;time.current=0}
  if(!world.playbackPaused)time.current+=Math.min(raw,.05);
  const p=stagePhase(world.t,index);
  groups.current.forEach((g,i)=>{
   const d=ROLE_PROPS[index][i],duration=[.23,.13,.29,.11,.22,.30][index];
   const a=smooth(.10+d.delay,.10+d.delay+duration,p),out=smooth(.76+i*.010,.90+i*.010,p),k=a*(1-out);
   g.visible=k>.001;
   const bounce=world.reducedMotion?0:Math.sin(a*Math.PI*2)*(1-a)*[.08,.38,.015,0,.035,.025][index];
   g.position.set(d.x+(d.from==="left"?(1-k)*-3:0),d.y+(d.from==="top"?1:-1)*(1-k)*4+bounce,d.z);
   if(index===2)g.position.y-=a*.09;
   g.scale.set(1,1,1);
   if(index===3)g.rotation.y=(1-a)*1.35;
   if(index===5&&d.kind==="map"){g.scale.set(d.from==="left"?Math.max(.01,a):1,d.from==="top"?Math.max(.01,a):1,1);g.rotation.y=(1-a)*.25;}
   g.rotation.z=(d.angle||0)+(world.reducedMotion?0:Math.sin(time.current*([.65,1.25,.42,.0,.65,.45][index])+i)*[.012,.06,.025,0,.012,.009][index]*k);
   g.userData.phase=k<.001?"hidden":out>0?"exiting":a<1?"entering":"holding";
  });
 });
 return <group name={"WorldProps-"+index}>{ROLE_PROPS[index].map((d,i)=><group key={i} ref={g=>{if(g)groups.current[i]=g}} position={[d.x,d.y,d.z]}>
  <StageCard assets={assets} kind={d.kind} width={d.w}/>
  {d.from==="bottom"&&<mesh name="PropWoodSupport" castShadow receiveShadow position={[0,-(d.y+2.08)/2,-.045]}><cylinderGeometry args={[.018,.022,d.y+2.08,7]}/><meshStandardMaterial color="#8e673f" roughness={.94}/></mesh>}
  {(d.from==="top"||d.from==="left")&&<mesh castShadow position={[0,3,0]}><cylinderGeometry args={[.008,.008,5.5,5]}/><meshStandardMaterial color="#9d743b" roughness={1}/></mesh>}
 </group>)}</group>;
}
