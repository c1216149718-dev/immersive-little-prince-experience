import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { damp, lerp, smooth, world } from "../state";
import { useModel } from "./ModelAsset";
import { spring } from "./secondaryMotion";

export interface FoxState { z: number; x: number; trust: number; sit: number; walk: number; startle: number; lastLine: number; lineT: number; leaving: number; phase: number }

export function RiggedFox({ fs, cursor }: { fs: { current: FoxState }; cursor: { value: THREE.Vector3 } }) {
  const root = useRef<THREE.Group>(null!);
  const model = useModel("fox");
  const animation = useMemo(() => {
    const mixer = new THREE.AnimationMixer(model.scene);
    return { mixer, idle:mixer.clipAction(model.clips.find(c=>c.name==="Idle")!), walk:mixer.clipAction(model.clips.find(c=>c.name==="Walk")!) };
  }, [model]);
  const rest = useMemo(()=>model.bones.Hips.position.clone(),[model]);
  const soles = useMemo(() => {
    const mesh = model.scene.getObjectByName("fox_visual") as THREE.SkinnedMesh;
    const position = mesh.geometry.attributes.position, candidates: number[] = [];
    for (let i = 0; i < position.count; i++) if (position.getY(i) < .004) candidates.push(i);
    return { mesh, indices: candidates.filter((_, i) => i % Math.max(1, Math.floor(candidates.length / 64)) === 0), point: new THREE.Vector3() };
  }, [model]);
  const clipPose = useMemo(() => Object.values(model.bones).map(bone => ({ bone, rotation: bone.quaternion.clone() })), [model]);
  const cur=useRef({sit:0,walk:0,yaw:0,pitch:0,previousX:0,previousZ:0,ready:false,
    ears:[{value:0,velocity:0},{value:0,velocity:0}],tail:Array.from({length:5},()=>({value:0,velocity:0}))});
  useEffect(()=>{animation.idle.play();animation.walk.play();return()=>{animation.mixer.stopAllAction();};},[animation]);
  useFrame((frame,rawDt)=>{
    const dt=Math.min(rawDt,.05),f=fs.current,c=cur.current,b=model.bones,time=frame.clock.elapsedTime;
    const dx=f.x-c.previousX,dz=f.z-c.previousZ;
    const speed=c.ready?Math.min(6,Math.hypot(dx,dz)/Math.max(dt,.001)):0;
    c.previousX=f.x;c.previousZ=f.z;c.ready=true;
    root.current.position.set(f.x,0,f.z);root.current.visible=f.leaving<.999;
    c.sit+=(f.sit-c.sit)*damp(2.5,dt);c.walk+=(f.walk-c.walk)*damp(6,dt);
    const yaw=THREE.MathUtils.clamp(Math.atan2(cursor.value.x-f.x,cursor.value.z-f.z),-.9,.9);
    c.yaw+=(yaw-c.yaw)*damp(3,dt);
    c.pitch+=(THREE.MathUtils.clamp(-Math.atan2(cursor.value.y-.5,Math.hypot(cursor.value.x-f.x,cursor.value.z-f.z)),-.3,.35)-c.pitch)*damp(3,dt);
    root.current.rotation.y=f.leaving>0?lerp(0,1.6,smooth(0,.3,f.leaving)):c.yaw*.35;
    animation.walk.setEffectiveWeight(c.walk*(1-c.sit));animation.idle.setEffectiveWeight(1-c.walk*(1-c.sit));
    animation.walk.setEffectiveTimeScale(speed/.48*(dz<0&&f.leaving===0?-1:1));
    for (const p of clipPose) p.bone.quaternion.copy(p.rotation);
    animation.mixer.update(dt);
    for (const p of clipPose) p.rotation.copy(p.bone.quaternion);
    f.phase+=speed/.48*Math.PI*2*dt;
    b.Hips.position.copy(rest);b.Hips.position.y-=c.sit*.075;
    b.Spine.rotation.x+=c.sit*-.18;
    b.Head.rotation.y=c.yaw*.6;b.Head.rotation.x=c.pitch+c.sit*.15-f.startle*.12;
    for(const side of ["L","R"]){
      b["Back"+side].rotation.x=lerp(b["Back"+side].rotation.x,-.95,c.sit);
      b["BackKnee"+side].rotation.x=lerp(b["BackKnee"+side].rotation.x,1.2,c.sit);
      b["Front"+side].rotation.x=lerp(b["Front"+side].rotation.x,.12,c.sit);
      const i=side==="L"?0:1;
      b["Ear"+side].rotation.x=spring(c.ears[i],world.reducedMotion?0:-f.startle*.18+Math.sin(time*1.3+i)*.025,dt,.2);
      b["Ear"+side].rotation.y=c.yaw*.12;
    }
    for(let i=0;i<5;i++){
      const target=world.reducedMotion?0:Math.sin(time*1.15-i*.45)*(.035+f.trust*.035)*(1-c.sit*.4);
      b["Tail"+i].rotation.y=spring(c.tail[i],target,dt,.1);
      b["Tail"+i].rotation.x=c.sit*.025;
    }
    model.scene.updateMatrixWorld(true);soles.mesh.skeleton.update();
    let floor=Infinity;
    for(const index of soles.indices){soles.mesh.getVertexPosition(index,soles.point);floor=Math.min(floor,soles.point.y);}
    if(Number.isFinite(floor))b.Hips.position.y-=floor;
  });
  return <group ref={root}><group name="FoxVisualRoot"><primitive object={model.scene} dispose={null}/></group></group>;
}
