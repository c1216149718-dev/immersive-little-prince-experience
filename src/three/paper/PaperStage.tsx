import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { world, smooth } from "../../state";
import { usePaperResources } from "./PaperCard";
import { PAPER_LAYOUT, paperDebrisPose, paperSeed, paperStagePose, paperWindRange, paperWindStrength } from "./paperMotion";

const CAPACITY=48;
function fragmentGeometry(points:number[][]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const size=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2((x-cx)/size,(cy-y)/size)));
  const g=new THREE.ShapeGeometry(shape),p=g.getAttribute("position"),uv=g.getAttribute("uv");
  for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)*size+cx)/1254,1-(cy-p.getY(i)*size)/1254);
  return g;
}
function windRibbon(index:number){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=128;i++){
    const u=i/128,x=-9+u*20;
    const y=1.45+index*.52+Math.sin(u*Math.PI*2+index*.8)*(.38+index*.07)+u*.35;
    const width=.035*(.7+.3*Math.sin(u*67+index))*(.3+.7*Math.sin(u*Math.PI));
    for(const side of [-1,1]){positions.push(x,y+side*width,-8-index*2.6);uv.push(u,(side+1)/2)}
    if(i<128){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  return g;
}
function windMaterial(){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uHead:{value:0},uTail:{value:0},uAlpha:{value:0}},
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:`varying vec2 vUv;uniform float uHead,uTail,uAlpha;
    void main(){
      float grain=fract(sin(dot(floor(vUv*vec2(1600.,12.)),vec2(12.9898,78.233)))*43758.5453);
      float edge=1.-smoothstep(.24,.5,abs(vUv.y-.5)+grain*.13);
      float ink=smoothstep(uTail,uTail+.025,vUv.x)*(1.-smoothstep(uHead-.025,uHead,vUv.x));
      float alpha=edge*ink*uAlpha*(.4+.6*grain);
      if(alpha<.035)discard;gl_FragColor=vec4(vec3(.94,.73,.38),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
}
export function PaperStage(){
  const resources=usePaperResources();
  const {camera,size}=useThree();
  const textures=useTexture([`${import.meta.env.BASE_URL}textures/paper/leaf-debris.png`,`${import.meta.env.BASE_URL}textures/paper/terrain-fragments.png`]);
  const stage=useRef<THREE.Group>(null!),roots=useRef<(THREE.Group|null)[]>([]);
  const chips=useRef<(THREE.InstancedMesh|null)[]>([]);
  const elapsed=useRef(0),replay=useRef(world.replayVersion);
  const helper=useMemo(()=>new THREE.Object3D(),[]),color=useMemo(()=>new THREE.Color(),[]);
  const dryColor=useMemo(()=>new THREE.Color("#b99964"),[]),ropePoint=useMemo(()=>new THREE.Vector3(),[]);
  const wind=useMemo(()=>Array.from({length:4},(_,i)=>new THREE.Mesh(windRibbon(i),windMaterial())),[]);
  const fragment=useMemo(()=>{
    textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4});
    return {
      geometries:[fragmentGeometry([[250,325],[280,335],[315,353],[343,381],[361,409],[332,398],[295,379],[269,355]]),
        fragmentGeometry([[222,669],[270,568],[285,555],[306,585],[327,666],[357,740],[315,728],[267,698]])],
      materials:textures.map(map=>new THREE.MeshStandardMaterial({map,emissiveMap:map,emissive:"#d5b578",emissiveIntensity:.2,roughness:1,side:THREE.DoubleSide}))
    };
  },[textures]);
  const holes=useMemo(()=>PAPER_LAYOUT.flatMap((c,i)=>c.kind==="cloud"?[{i,x:-.265*c.width,y:-.155*c.width},{i,x:.175*c.width,y:-.148*c.width}]:c.kind==="star"?[{i,x:0,y:-.132*c.width}]:[]),[]);
  const ropeMaterial=useMemo(()=>new THREE.LineBasicMaterial({color:"#b99862"}),[]);
  const ropes=useMemo(()=>holes.map(()=>{const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(9),3));return new THREE.Line(g,ropeMaterial)}),[holes,ropeMaterial]);
  useEffect(()=>{const instances=chips.current.slice();return ()=>{instances.forEach(m=>m?.dispose());wind.forEach(m=>{m.geometry.dispose();m.material.dispose()});ropes.forEach(m=>m.geometry.dispose());ropeMaterial.dispose();fragment.geometries.forEach(g=>g.dispose());fragment.materials.forEach(m=>m.dispose())}},[wind,ropes,ropeMaterial,fragment]);
  useFrame((_,dt)=>{
    const t=world.t;stage.current.visible=t>=8.95&&t<11.03;
    if(replay.current!==world.replayVersion){replay.current=world.replayVersion;elapsed.current=0}
    if(!world.playbackPaused&&!world.reducedMotion&&t>=9&&t<10.85)elapsed.current+=Math.min(dt,.05);
    const poses=PAPER_LAYOUT.map((_,i)=>paperStagePose(i,t,elapsed.current,world.reducedMotion));
    roots.current.forEach((root,i)=>{if(!root)return;const p=poses[i];const edgeOffset=PAPER_LAYOUT[i].side*Math.max(0,size.width/size.height-1.78)*Math.max(1,camera.position.z-p.z)*Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov/2));root.position.set(p.x+edgeOffset,p.y,p.z);root.rotation.set(p.tilt,0,p.rotation);root.updateMatrix()});
    ropes.forEach((line,j)=>{
      const h=holes[j],card=PAPER_LAYOUT[h.i],root=roots.current[h.i];if(!root)return;
      const point=ropePoint.set(h.x,h.y,.015).applyMatrix4(root.matrix);
      const p=line.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0,card.x+h.x,24,card.z+.015);
      p.setXYZ(1,(card.x+h.x+point.x)/2+.035,(24+point.y)/2,point.z);
      p.setXYZ(2,point.x,point.y,point.z);p.needsUpdate=true;line.geometry.computeBoundingSphere();
    });
    const counts=[0,0];
    for(let i=0;i<CAPACITY;i++){
      const p=paperDebrisPose(i,t,world.reducedMotion);if(!p)continue;
      const mix=smooth(paperSeed(i+91)*.35,.65+paperSeed(i+91)*.35,p.sand);
      for(let k=0;k<2;k++){
        const weight=k?mix:1-mix;if(weight<.03)continue;
        helper.position.set(p.x,p.y,p.z);helper.rotation.set(p.rx,p.ry,p.rz);
        helper.scale.setScalar(p.scale*weight*(k?.8:1));helper.updateMatrix();
        const m=chips.current[k]!;m.setMatrixAt(counts[k],helper.matrix);
        color.set(k?"#e2c59b":"#fff0b7").lerp(dryColor,k?0:p.sand*.5);
        m.setColorAt(counts[k]++,color);
      }
    }
    chips.current.forEach((m,k)=>{if(!m)return;m.count=counts[k];m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true});
    wind.forEach((m,i)=>{
      const range=paperWindRange(i,t,world.reducedMotion),u=m.material.uniforms;
      u.uTail.value=range.start/128;u.uHead.value=(range.start+range.count)/128;
      u.uAlpha.value=(.38+paperWindStrength(t)*.42)*(1-smooth(10.75,11.03,t));
      m.visible=range.count>1;m.position.x=paperWindStrength(t)*.35;
    });
  });
  return <group ref={stage} name="PaperTheatre">
    {PAPER_LAYOUT.map((c,i)=><group key={i} name={`PaperProp-${i}`} ref={n=>{roots.current[i]=n}} position={[c.x,20,c.z]}>
      <mesh name={`PaperCard-${c.kind}`} geometry={resources.geometries[c.kind]} material={resources.materials} scale={c.width} dispose={null}/>
    </group>)}
    {ropes.map((m,i)=><primitive key={`rope-${i}`} object={m} dispose={null}/>)}
    {wind.map((m,i)=><primitive key={`wind-${i}`} object={m} dispose={null}/>)}
    {fragment.geometries.map((g,i)=><instancedMesh key={i} name={i?"PaperSand":"PaperLeaves"} ref={n=>{chips.current[i]=n}} args={[g,fragment.materials[i],CAPACITY]} count={0} frustumCulled={false} dispose={null}/>)}
  </group>;
}
