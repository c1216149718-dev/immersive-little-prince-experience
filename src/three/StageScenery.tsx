import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { world,smooth } from "../state";
import { StageCard,type StageAssets,type StageAsset } from "./StageAssets";
type Prop={kind:StageAsset;x:number;y:number;z:number;w:number;angle?:number;hang?:boolean;delay:number};
const layout:Prop[]=[
 {kind:"cloud-bank",x:-4.9,y:-2.6,z:5.0,w:5.4,delay:0},
 {kind:"cloud",x:-3.1,y:-3.0,z:5.8,w:3.4,delay:.06},
 {kind:"cloud-b",x:4.95,y:-2.3,z:4.5,w:5.1,delay:.03},
 {kind:"cloud-bank",x:3.4,y:-2.9,z:5.6,w:3.7,delay:.09},
 {kind:"cloud",x:-5.8,y:-2.55,z:-3.4,w:4.3,delay:.10},
 {kind:"cloud-b",x:5.2,y:-2.65,z:-3.8,w:4.6,delay:.14},
 {kind:"cloud-stick",x:-5.25,y:-1.85,z:1.4,w:2.8,angle:-.045,delay:.12},
 {kind:"cloud-stick-b",x:5.7,y:-1.65,z:.6,w:3.2,angle:.055,delay:.16},
 {kind:"cloud-stick",x:-3.7,y:-2.2,z:-2,w:1.7,angle:.06,delay:.18},
 {kind:"cloud-hang",x:-5.1,y:3.4,z:.7,w:3.6,hang:true,angle:-.035,delay:.03},
 {kind:"cloud-hang-b",x:5.9,y:3.65,z:-1.7,w:3.9,hang:true,angle:.02,delay:.10},
 {kind:"cloud-hang-b",x:-2.7,y:4.25,z:-3.3,w:2.5,hang:true,angle:.035,delay:.16},
 {kind:"hanging-star",x:-4.15,y:2.2,z:2.1,w:1.0,hang:true,delay:.04},
 {kind:"hanging-star-b",x:-1.7,y:4.3,z:-.8,w:.67,hang:true,angle:.07,delay:.10},
 {kind:"hanging-star",x:1.3,y:4.8,z:-2.5,w:.8,hang:true,delay:.14},
 {kind:"hanging-star-b",x:4.3,y:2.7,z:2.4,w:1.25,hang:true,delay:.06},
 {kind:"hanging-star",x:6.6,y:1.65,z:.2,w:.68,hang:true,delay:.20},
 {kind:"star",x:-4.3,y:-2.1,z:2.3,w:.95,angle:-.09,delay:.17},
 {kind:"star-b",x:4.2,y:-1.9,z:1.3,w:.8,angle:.065,delay:.21}
];
export function StageScenery({assets}:{assets:StageAssets}){
 const refs=useRef<THREE.Group[]>([]),state=useRef({time:0,last:new THREE.Vector2(),v:layout.map(()=>0),x:layout.map(()=>0),version:-1});
 const point=useRef(new THREE.Vector3());
 useFrame(({camera},raw)=>{
  const dt=Math.min(raw,.033),s=state.current;
  if(s.version!==world.replayVersion){s.time=0;s.v.fill(0);s.x.fill(0);s.last.copy(world.mouse);s.version=world.replayVersion}
  const speed=THREE.MathUtils.clamp((world.mouse.x-s.last.x)/Math.max(dt,.001),-4,4);s.last.copy(world.mouse);
  if(!world.playbackPaused)s.time+=dt;
  refs.current.forEach((g,i)=>{
   const p=layout[i],a=smooth(5.23+p.delay,5.49+p.delay,world.t),near=(p.z+5)/11;
   g.getWorldPosition(point.current);point.current.project(camera);
   const d=Math.hypot(point.current.x-world.mouse.x,point.current.y-world.mouse.y);
   const force=world.mouseActive&&!world.reducedMotion?Math.max(0,1-d/.36)*speed*.24*near:0;
   if(world.reducedMotion){s.v[i]=0;s.x[i]=0}else{s.v[i]+=(force-8*s.x[i]-3.8*s.v[i])*dt;s.x[i]+=s.v[i]*dt;}
   const breathe=world.reducedMotion?0:Math.sin(s.time*(.65+i*.029)+i*2.1);
   const travel=(1-a)*(p.hang?4:-2.3);
   const spring=world.reducedMotion?0:Math.sin(a*Math.PI*2)*.08*(1-a);
   g.position.y=p.y+travel+spring+breathe*(p.hang?.034:.010);
   g.rotation.z=(p.angle||0)+breathe*(p.hang?.020:.005)+s.x[i];
   g.rotation.y=world.reducedMotion?0:Math.sin(s.time*.4+i)*.025;
  });
 });
 return <group name="StageFixedProps">{layout.map((p,i)=><group key={i} name={"Scenery-"+p.kind+"-"+i} ref={g=>{if(g)refs.current[i]=g}} position={[p.x,p.y,p.z]}>
  <StageCard assets={assets} kind={p.kind} width={p.w}/>
  {(p.kind==="star"||p.kind==="star-b")&&<mesh castShadow receiveShadow position={[0,-(p.y+3.2)/2,-.04]}><cylinderGeometry args={[.016,.02,p.y+3.2,6]}/><meshStandardMaterial color="#997346" roughness={.94}/></mesh>}
 </group>)}</group>;
}

