import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import contours from "./cardContours.json";

export type CardKind=keyof typeof contours.cards;
export function makeCardGeometry(kind:CardKind){
  const card=contours.cards[kind], [x0,y0,x1,y1]=card.bounds,span=x1-x0;
  const pivotY=card.pivot==="top"?y0:y1;
  const points=(list:number[][])=>list.map(([x,y])=>new THREE.Vector2((x-(x0+x1)/2)/span,(pivotY-y)/span));
  const shape=new THREE.Shape(points(card.outer));
  for(const hole of card.holes)shape.holes.push(new THREE.Path(points(hole)));
  const g=new THREE.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:false,steps:1,curveSegments:1});
  const pos=g.getAttribute("position"),uv=g.getAttribute("uv");
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)*span+(x0+x1)/2)/1254,1-(pivotY-pos.getY(i)*span)/1254);
  return g;
}
/** Shared by every repeated prop in one stage; no per-frame React updates. */
export function usePaperResources(){
  const atlas=useTexture(`${import.meta.env.BASE_URL}textures/paper/cards-atlas.png`);
  const resources=useMemo(()=>{
    atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;
    const face=new THREE.MeshStandardMaterial({map:atlas,emissiveMap:atlas,emissive:"#d8b881",emissiveIntensity:.26,roughness:.91});
    face.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
    float hi=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
    float lo=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
    if(hi>.35&&hi-lo<.14)discard;`)};
    face.customProgramCacheKey=()=>"paper-v2";
    return {geometries:{wheatTall:makeCardGeometry("wheatTall"),wheatBase:makeCardGeometry("wheatBase"),cloud:makeCardGeometry("cloud"),star:makeCardGeometry("star")},
      materials:[face,new THREE.MeshStandardMaterial({color:"#705035",roughness:1})]};
  },[atlas]);
  useEffect(()=>()=>{Object.values(resources.geometries).forEach(g=>g.dispose());resources.materials.forEach(m=>m.dispose())},[resources]);
  return resources;
}
