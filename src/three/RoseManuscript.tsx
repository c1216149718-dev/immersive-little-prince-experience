import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { world, smooth } from "../state";
import { hash, paperTexture, starSpriteTexture } from "./util";
import type { RoseMotion } from "./roseMotion";

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function tornGeometry(seed:number){
  const shape=new THREE.Shape();shape.moveTo(-.5,-.5);
  for(let i=0;i<=240;i++)shape.lineTo(-.5+i/240,.5-(hash(i*7.31+seed)*.008+Math.sin(i*.19)*.022+Math.sin(i*.047+seed)*.028));
  shape.lineTo(.5,-.5);shape.closePath();return new THREE.ShapeGeometry(shape);
}
export function RoseManuscript({motion}:{motion:MutableRefObject<RoseMotion>}){
  const [paperMap,sketch]=useTexture([`${import.meta.env.BASE_URL}textures/rose/burgundy-paper-v1.png`,`${import.meta.env.BASE_URL}textures/rose/botanical-study-v1.png`]);
  paperMap.colorSpace=sketch.colorSpace=THREE.SRGBColorSpace;
  const papers=useRef<THREE.Group>(null!),studies=useRef<THREE.Group>(null!),orbits=useRef<THREE.Group>(null!),dust=useRef<THREE.Points>(null!);
  const resources=useMemo(()=>{
    const study=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:sketch},uDraw:{value:0},uAlpha:{value:0},uInk:{value:new THREE.Color("#b87d64")}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform vec3 uInk;uniform sampler2D map;uniform float uDraw,uAlpha;void main(){vec4 ink=texture2D(map,vUv);float reveal=smoothstep(1.-uDraw-.035,1.-uDraw,vUv.y);float graphite=pow(clamp((1.-dot(ink.rgb,vec3(.2126,.7152,.0722))-.08)/.92,0.,1.),1.25);gl_FragColor=vec4(uInk,graphite*reveal*uAlpha);#include <tonemapping_fragment>
#include <colorspace_fragment>
}`.replace(';#include',';\n#include')});
    const studyRight=study.clone();studyRight.uniforms.map.value=sketch;studyRight.uniforms.uInk.value=new THREE.Color("#27131c");
    const paper=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{uAlpha:{value:0},uPaper:{value:paperMap}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform float uAlpha;uniform sampler2D uPaper;void main(){vec2 page=vUv+.5;vec3 c=texture2D(uPaper,page*vec2(.68,.82)+vec2(.14,.1)).rgb*vec3(.60,.61,.78);c=mix(c,vec3(.095,.027,.043),.35);gl_FragColor=vec4(c,uAlpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
    const orbit=new THREE.LineBasicMaterial({color:'#c89664',transparent:true,opacity:.22,depthWrite:false});
    const lines:THREE.BufferGeometry[]=[];
    for(let j=0;j<3;j++){const points=[];for(let i=0;i<=220;i++){const a=i/220*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*(3.2+j*.65),Math.sin(a)*(3.2+j*.65)*.95,.008*Math.sin(a*17)))}lines.push(new THREE.BufferGeometry().setFromPoints(points))}
    const sphereLines=new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(.52,1));
    const pos=new Float32Array(110*3);for(let i=0;i<110;i++){pos[i*3]=(hash(i*5.1)-.5)*12;pos[i*3+1]=(hash(i*7.7)-.5)*8;pos[i*3+2]=-1-hash(i*11.3)*7}
    const particles=new THREE.BufferGeometry();particles.setAttribute('position',new THREE.BufferAttribute(pos,3));
    return {study,studyRight,paper,orbit,lines,sphereLines,particles,tears:[tornGeometry(7),tornGeometry(23)],plane:new THREE.PlaneGeometry(1,1)};
  },[sketch,paperMap]);
  useEffect(()=>()=>{resources.studyRight.dispose();resources.study.dispose();resources.paper.dispose();resources.orbit.dispose();resources.lines.forEach(g=>g.dispose());resources.tears.forEach(g=>g.dispose());resources.sphereLines.dispose();resources.particles.dispose();resources.plane.dispose()},[resources]);
  useFrame(()=>{
    const m=motion.current,t=world.t,stay=1-smooth(4.76,5,t);
    const enter=smooth(3.02,3.32,t);
    resources.study.uniforms.uDraw.value=smooth(3.12,3.52,t);resources.study.uniforms.uAlpha.value=.24*stay;resources.studyRight.uniforms.uAlpha.value=.58*stay;resources.studyRight.uniforms.uDraw.value=resources.study.uniforms.uDraw.value;
    resources.paper.uniforms.uAlpha.value=.86*enter*stay;
    resources.orbit.opacity=.075*smooth(3.16,3.45,t)*stay;
    resources.lines.forEach((g,i)=>g.setDrawRange(0,Math.floor(221*smooth(3.1+i*.08,3.6+i*.08,t))));
    papers.current.position.set(m.x*.7,m.y*.5,0);papers.current.rotation.z=m.x*.018;
    studies.current.position.set(m.x*.32,m.y*.22,0);orbits.current.position.set(m.x*.10,m.y*.075,0);
    dust.current.rotation.z=m.time*.002; (dust.current.material as THREE.PointsMaterial).opacity=.4*enter*stay;
  });
  return <group name="RoseManuscript">
    <group ref={papers} name="RosePaperLayers">
      <mesh geometry={resources.tears[0]} material={resources.paper} position={[6.6,1,-5.5]} scale={[11,3.4,1]} rotation={[0,0,1.65]}/>
      <mesh geometry={resources.tears[1]} material={resources.paper} position={[-4.4,5.1,-6]} scale={[8,2.2,1]} rotation={[0,0,3.22]}/>
      <mesh geometry={resources.tears[0]} material={resources.paper} position={[6,-3.4,-5]} scale={[7,2.1,1]} rotation={[0,0,.25]}/>
    </group>
    <group ref={studies} name="RoseBotanicalStudies">
      <mesh geometry={resources.plane} material={resources.study} renderOrder={4} position={[-5.05,-.05,-4.6]} scale={[2.5,3.75,1]} rotation={[0,0,-.15]}/>
      <mesh geometry={resources.plane} material={resources.studyRight} renderOrder={4} position={[5.75,1.7,-5.2]} scale={[3.05,4.58,1]} rotation={[0,0,.1]}/>
    </group>
    <group ref={orbits} name="RoseAstronomy" position={[0,0,0]}>
      {resources.lines.map((g,i)=><primitive key={i} object={new THREE.Line(g,resources.orbit)} position={[.3,.35,-4.9-i*.2]} rotation={[0,0,i*.3]}/>)}
      <lineSegments geometry={resources.sphereLines} material={resources.orbit} position={[2.8,3.35,-4.5]}/>
      {[[-3.4,-2],[3,1.7],[1.7,3.7],[-.6,3.7],[4.3,-.7]].map(([x,y],i)=><sprite key={i} position={[x,y,-4]} scale={[.13,.19,1]}><spriteMaterial map={starSpriteTexture()} color="#deb27c" transparent opacity={.6} depthWrite={false}/></sprite>)}
    </group>
    <points ref={dust} name="RoseDust" geometry={resources.particles}><pointsMaterial map={starSpriteTexture()} color="#ffc791" size={.038} transparent opacity={.4} depthWrite={false}/></points>
  </group>;
}

export function RosePlanetoid(){
  const rock=useMemo(()=>{
    const g=new THREE.SphereGeometry(2.4,100,64),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i),n=v.clone().normalize();const d=Math.sin(n.x*15+n.y*7)*Math.sin(n.z*19)*.026+Math.sin(n.y*39+n.x*17)*.009;v.addScaledVector(n,d);p.setXYZ(i,v.x,v.y,v.z)}g.computeVertexNormals();
    const m=new THREE.MeshStandardMaterial({color:'#bb9284',roughness:.96,bumpMap:paperTexture(512,12),bumpScale:.045});
    m.onBeforeCompile=s=>{s.vertexShader='varying vec3 vRock;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRock=position;');s.fragmentShader='varying vec3 vRock;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 q=vRock.xz*7.;vec2 id=floor(q);vec2 f=fract(q);float first=9.,second=9.;
for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 o=vec2(float(x),float(y));vec2 h=fract(sin(vec2(dot(id+o,vec2(127.1,311.7)),dot(id+o,vec2(269.5,183.3))))*43758.5453);float d=length(o+h-f);if(d<first){second=first;first=d;}else{second=min(second,d);}}
float seam=1.-smoothstep(.01,.042,second-first);float grain=fract(sin(dot(vRock,vec3(713.1,911.7,413.2)))*43758.5);diffuseColor.rgb*=.92+grain*.08;diffuseColor.rgb*=1.-seam*.23;
`)};
    const pebble=new THREE.IcosahedronGeometry(1,0);const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();const instances=[];
    for(let i=0;i<26;i++){const a=hash(i*2.1)*Math.PI*2,r=.28+hash(i*5.9)*1.6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=Math.sqrt(2.4*2.4-r*r);q.setFromEuler(new THREE.Euler(i,hash(i)*4,i*.7));matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(.04+hash(i*7)*.09,.025+hash(i*3)*.04,.05+hash(i*9)*.06));instances.push(matrix.clone())}
    return {g,m,pebble,instances};
  },[]);
  useEffect(()=>()=>{rock.g.dispose();rock.m.dispose();rock.pebble.dispose()},[rock]);
  return <group name="RosePlanetoid" position={[0,-3.83,0]}>
    <mesh geometry={rock.g} material={rock.m}/>
    <instancedMesh args={[rock.pebble,rock.m,26]} ref={m=>{if(m){rock.instances.forEach((v,i)=>m.setMatrixAt(i,v));m.instanceMatrix.needsUpdate=true}}}/>
  </group>;
}
