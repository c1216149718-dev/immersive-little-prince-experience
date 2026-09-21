import { useEffect,useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
const paths={
 "cloud":"stage/clouds/base-c","cloud-bank":"stage/clouds/base-a","cloud-b":"stage/clouds/base-b",
 "cloud-stick":"stage/clouds/stick-a","cloud-stick-b":"stage/clouds/stick-b",
 "cloud-hang":"stage/clouds/hanging-a","cloud-hang-b":"stage/clouds/hanging-b",
 "hanging-star":"stage/stars/hanging-a","hanging-star-b":"stage/stars/hanging-b",
 "star":"stage/stars/stick-a","star-b":"stage/stars/stick-b",
 king:"characters/king/king",applause:"characters/vain-man/applause",bottle:"characters/tippler/bottle",
 ledger:"characters/businessman/ledger",lantern:"characters/lamplighter/lantern",map:"characters/geographer/map",compass:"characters/geographer/compass"
} as const;
export const STAGE_ASSETS=Object.keys(paths) as StageAsset[];
export type StageAsset=keyof typeof paths;
export function useStageAssets(){
 const textures=useTexture(STAGE_ASSETS.map(n=>import.meta.env.BASE_URL+"textures/worlds-stage/v2/"+paths[n]+".png"));
 const assets=useMemo(()=>Object.fromEntries(STAGE_ASSETS.map((name,i)=>{
  const map=textures[i];map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map,alphaTest:.4,side:THREE.DoubleSide,roughness:.91});
  const depth=new THREE.MeshDepthMaterial({map,alphaTest:.4,side:THREE.DoubleSide,depthPacking:THREE.RGBADepthPacking});
  const image=map.image as {width:number;height:number};
  return [name,{material,depth,aspect:image.width/image.height}];
 })),[textures]) as Record<StageAsset,{material:THREE.MeshStandardMaterial;depth:THREE.MeshDepthMaterial;aspect:number}>;
 useEffect(()=>()=>Object.values(assets).forEach(a=>{a.material.dispose();a.depth.dispose()}),[assets]);return assets;
}
export type StageAssets=ReturnType<typeof useStageAssets>;
export function StageCard({assets,kind,width=1}:{assets:StageAssets;kind:StageAsset;width?:number}){
 const aspect=assets[kind].aspect;
 const geometry=useMemo(()=>{
  const g=new THREE.PlaneGeometry(width,width/aspect,kind==="map"?20:6,8);
  if(kind==="map"){
   const p=g.attributes.position;
   for(let i=0;i<p.count;i++){const x=p.getX(i)/width,y=p.getY(i)*aspect/width;p.setZ(i,.16*width*x*x+.025*Math.sin(y*8));}
   g.computeVertexNormals();
  }
  return g;
 },[width,aspect,kind]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} material={assets[kind].material} customDepthMaterial={assets[kind].depth} castShadow receiveShadow/>;
}
