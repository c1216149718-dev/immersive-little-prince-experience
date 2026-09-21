import * as THREE from "three";
import { ModelAsset } from "./ModelAsset";
import { placeOnSphere, dirFromLatLon } from "./util";
import { damp } from "../state";
import ground from "./ground-offset.json";
import fixtures from "./planet-fixtures.json";

export const R = 2.4;
// Measured fixture directions after baking the source globe's true center.
export const ROSE_DIR = new THREE.Vector3(-.225, .372, .202).normalize();
export const CHAIR_DIR = new THREE.Vector3().fromArray(fixtures.chair.up);
export const VOLCANO_DIRS = [new THREE.Vector3().fromArray(fixtures.blockers.find(b=>b.id==="volcano")!.direction)];
export const PRINCE_START = dirFromLatLon(82, 12);
export const planetFx = { roseNear: 0, volcanoNear: 0, sunset: 0 };
// The navigation sphere is independent of the detailed visual mesh.
export function surfaceRadius(_n: THREE.Vector3) { return R; }
// Baked low-frequency visual height. It never changes navigation or radial normals.
export function visualGroundOffset(n: THREE.Vector3) {
  const x=(Math.atan2(n.z,n.x)/(2*Math.PI)+.5)*ground.width-.5;
  const y=THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(n.y,-1,1))/Math.PI*ground.height-.5,0,ground.height-1);
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const at=(u:number,v:number)=>ground.offsets[Math.min(v,ground.height-1)*ground.width+((u%ground.width)+ground.width)%ground.width];
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),fx),THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),fx),fy);
}
export function placeOnB612(obj: THREE.Object3D, dir: THREE.Vector3, spin = 0, lift = 0) {
  placeOnSphere(obj, dir.clone().normalize(), R, spin, lift);
}

export function B612() {
  return <ModelAsset name="b612" />;
}
export function approach(v: { current: number }, target: number, dt: number, rate = 3) {
  v.current += (target - v.current) * damp(rate, dt);
  return v.current;
}
