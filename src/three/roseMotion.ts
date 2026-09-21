import * as THREE from "three";
import { smooth } from "../state";

export interface RoseMotion { time:number; x:number; y:number; vx:number; vy:number; mx:number; my:number; px:number; py:number; life:number }
export const newRoseMotion=():RoseMotion=>({time:0,x:0,y:0,vx:0,vy:0,mx:0,my:0,px:0,py:0,life:1});
/** Damped air impulse, not cursor-position dragging. Clamp acceleration from event spikes. */
export function stepRoseWind(m:RoseMotion,x:number,y:number,dt:number,reduced:boolean,paused:boolean){
  if(paused){m.mx=x;m.my=y;return}
  if(reduced){m.x=m.y=m.vx=m.vy=m.px=m.py=0;m.mx=x;m.my=y;return}
  const h=Math.max(.001,Math.min(dt,.05));
  m.time+=h;
  const dx=THREE.MathUtils.clamp((x-m.mx)/h,-5,5),dy=THREE.MathUtils.clamp((y-m.my)/h,-5,5);
  const ax=THREE.MathUtils.clamp((dx-m.px)/h,-15,15),ay=THREE.MathUtils.clamp((dy-m.py)/h,-15,15);
  m.vx+=(dx*.9+ax*.025-m.x*7-m.vx*4.2)*h;
  m.vy+=(dy*.9+ay*.025-m.y*7-m.vy*4.2)*h;
  m.x=THREE.MathUtils.clamp(m.x+m.vx*h,-.38,.38);m.y=THREE.MathUtils.clamp(m.y+m.vy*h,-.38,.38);
  m.mx=x;m.my=y;m.px=dx;m.py=dy;
}
// Authored from Blender's separated petal, in the original GLB's Y-up frame.
export const PETAL_CENTRE = new THREE.Vector3(-0.05531620606780052,0.7743780016899109,0.14602817595005035);
export const PETAL_COVER_POINT = new THREE.Vector3(0.005088932812213898,-0.043014347553253174,-0.02090848982334137);
const PETAL_NORMAL = new THREE.Vector3(-.4717609,-.31844196,.82221425).normalize();
/** A short authored gust leads the release, independent of cursor activity. */
export function roseGust(t:number){
  const envelope=smooth(4.22,4.32,t)*(1-smooth(4.40,4.5,t));
  return envelope*(.65+.35*Math.sin((t-4.22)*95));
}
export function roseTransition(t:number){
  return {departure:smooth(4.5,4.83,t),cover:smooth(4.78,4.975,t),reveal:smooth(5.04,5.32,t)};
}
export function rosePetalPosition(t:number,out=new THREE.Vector3()){
  const drop=smooth(4.5,4.60,t),rise=smooth(4.58,4.87,t);
  return out.copy(PETAL_CENTRE).multiplyScalar(3).add(new THREE.Vector3(-.10*drop+.32*rise+.12*Math.sin(rise*Math.PI),-2.05-.20*drop+2.8*rise,.32*rise+.08*Math.sin(rise*Math.PI)));
}
export function rosePetalQuaternion(t:number,out=new THREE.Quaternion()){
  const p=smooth(4.5,4.86,t),air=Math.sin(p*Math.PI);
  return out.setFromEuler(new THREE.Euler(.12*p+.18*Math.sin(p*Math.PI*2)*air,-.18*p+.28*air,.95*p));
}
/** One deterministic lens path is also used to rebase the same petal across origins. */
export function roseFollowCamera(t:number,position:THREE.Vector3,target:THREE.Vector3){
  t=Math.min(t,4.98);
  const q=rosePetalQuaternion(t),petal=rosePetalPosition(t);
  const anchor=PETAL_COVER_POINT.clone().multiplyScalar(3).applyQuaternion(q).add(petal);
  const normal=new THREE.Vector3(0,0,1).lerp(PETAL_NORMAL.clone().applyQuaternion(q),smooth(4.75,4.94,t)).normalize();
  const approach=smooth(4.20,4.72,t),follow=smooth(4.50,4.76,t),macro=smooth(4.78,4.975,t);
  target.set(.02,.53,0).lerp(anchor,follow);
  const distance=THREE.MathUtils.lerp(THREE.MathUtils.lerp(6.35,2.1,approach),.016,macro);
  position.copy(target).addScaledVector(normal,distance);
  position.y+=.07*(1-follow);
}
