import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { world, smooth, lerp } from "../state";
import { glowTexture } from "./util";
import { RoseVisual } from "./RoseVisual";
import { RoseManuscript, RosePlanetoid } from "./RoseManuscript";
import { RosePetalTransition } from "./RosePetalTransition";
import { FoxDepthOfField } from "./FoxDepthOfField";
import { newRoseMotion, stepRoseWind, roseTransition, roseFollowCamera, roseGust } from "./roseMotion";

export const ROSE_ORIGIN = new THREE.Vector3(0,-300,0);
const DOF_INTERVAL=[3.06,3.3,4.60,4.78] as const;
function petalGeometry(){
  const g=new THREE.PlaneGeometry(1,1.5,14,22);g.translate(0,.75,0);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),v=p.getY(i)/1.5;const w=Math.pow(Math.sin(v*Math.PI),.55)*(1-v*.1)+.03*(1-v);const nx=x*w*.85;p.setXYZ(i,nx,v*1.5,-nx*nx*.9+v*v*v*.55-v*.15)}
  g.computeVertexNormals();return g;
}
export function RoseScene(){
  const paper=useTexture(`${import.meta.env.BASE_URL}textures/rose/burgundy-paper-v1.png`);paper.colorSpace=THREE.SRGBColorSpace;
  const {camera}=useThree();const root=useRef<THREE.Group>(null!),rose=useRef<THREE.Group>(null!),petals=useRef<THREE.Group>(null!),halo=useRef<THREE.Sprite>(null!);
  const view=useRef(new THREE.Vector2()),lights=useRef<THREE.Light[]>([]),motion=useRef({...newRoseMotion(),mx:world.mouse.x,my:world.mouse.y}),version=useRef(world.replayVersion),previousT=useRef(world.t);
  const resources=useMemo(()=>{
    const geo=petalGeometry();
    const petal=new THREE.MeshStandardMaterial({color:'#c95765',roughness:.64,side:THREE.DoubleSide});

    const foreground=petal.clone();foreground.transparent=true;foreground.depthWrite=false;
    foreground.onBeforeCompile=s=>{
      s.vertexShader='varying vec2 vPetalUv;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPetalUv=uv;');
      s.fragmentShader='varying vec2 vPetalUv;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float edge=min(min(vPetalUv.x,1.-vPetalUv.x),min(vPetalUv.y,1.-vPetalUv.y));
      diffuseColor.a*=smoothstep(0.,.16,edge)*.85;`);
    };
    const backdrop=new THREE.ShaderMaterial({side:THREE.DoubleSide,depthWrite:false,uniforms:{uPresence:{value:0},uPaper:{value:paper}},vertexShader:'varying vec2 vPage;void main(){vPage=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vPage;uniform float uPresence;uniform sampler2D uPaper;
void main(){vec2 p=(vPage-.5)*vec2(1.4,.8);float centre=exp(-dot(p,p)*5.);
vec3 c=texture2D(uPaper,vPage).rgb*vec3(.42,.46,.67);c=mix(c,vec3(.065,.016,.033),.48);c*=mix(.65,1.,centre);c*=mix(.5,1.,uPresence);
gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
    const target=new THREE.Object3D();target.position.copy(ROSE_ORIGIN);target.updateMatrixWorld();
    return {geo,petal,foreground,backdrop,target,glow:glowTexture(512,'rgba(255,179,119,1)','rgba(255,147,104,0)',1.6)};
  },[paper]);
  const focus=useMemo(()=>new THREE.Vector3(0,-299.4,0),[]);
  const scratch=useMemo(()=>({pos:new THREE.Vector3(),target:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)}),[]);
  useEffect(()=>()=>{const lens=camera as THREE.PerspectiveCamera;lens.near=.05;lens.updateProjectionMatrix();resources.geo.dispose();resources.petal.dispose();resources.foreground.dispose();resources.backdrop.dispose()},[resources,camera]);
  useFrame((_,dtRaw)=>{
    const dt=Math.min(dtRaw,.05),t=world.t;
    if(version.current!==world.replayVersion||t<previousT.current-.15){motion.current=newRoseMotion();motion.current.mx=world.mouse.x;motion.current.my=world.mouse.y;version.current=world.replayVersion;view.current.set(0,0)}
    previousT.current=t;
    stepRoseWind(motion.current,world.mouse.x,world.mouse.y,dt,world.reducedMotion,world.playbackPaused);
    const gust=world.reducedMotion?0:roseGust(t);
    const m=motion.current,phase=roseTransition(t),enter=smooth(3.03,3.43,t),life=1-phase.departure;
    m.life=life;
    root.current.visible=t<5;
    resources.backdrop.uniforms.uPresence.value=smooth(2.96,3.3,t);
    // Directional sources remain scoped in intensity even during resident scene overlap.
    const power=enter*(1-smooth(4.89,5,t));
    lights.current.forEach((l,i)=>{if(l)l.intensity=[2.5,3.7,.18,.14][i]*power});
    const response=world.reducedMotion?0:1-smooth(4.35,4.5,t);
    if(!world.playbackPaused)view.current.lerp(new THREE.Vector2(world.mouse.x*.12*response,world.mouse.y*.045*response),1-Math.exp(-dt*2.8));
    if(world.reducedMotion)view.current.set(0,0);
    rose.current.rotation.set(-view.current.y,view.current.x,world.reducedMotion?0:Math.sin(m.time*.55)*.002*life);
    const hm=halo.current.material as THREE.SpriteMaterial;
    hm.opacity=(.20+(world.reducedMotion?0:Math.sin(m.time*1.03)*.025))*enter*(1-phase.departure*.65);
    const breathe=world.reducedMotion?0:Math.sin(m.time*.75)*.035;
    halo.current.scale.setScalar(5.8+breathe);
    const positions=[[-2.55,-1.7,2.8],[3.35,-.2,3.1],[-1.55,.15,2.1],[1.25,-1.3,2.4]];
    petals.current.children.forEach((o,i)=>{
      const [x,y,z]=positions[i],clock=m.time;
      // Slow multi-frequency drift plus a damped cursor impulse; no elapsed-rotation accumulation.
      const drift=world.reducedMotion?0:(Math.sin(clock*.13+i)+Math.sin(clock*.21+i*2.7)*.35)*.055*life;
      const fall=world.reducedMotion?0:drift*.3;
      o.position.set(x+drift+m.x*1.6+gust*.12,y+fall+m.y*.85+gust*.035,z);
      o.rotation.set(.18+drift*.5,-.3+i*.38,[-.8,.8,-.4,.5,-.4][i]+drift*2+m.x*.6);
      o.scale.setScalar(([1.65,1.05,.27,.28][i])*(1-phase.departure*.8));
      o.visible=t>3.08&&t<4.98;
    });
    const lens=camera as THREE.PerspectiveCamera;
    const near=t>=4.6&&t<5.34?.001:.05;
    if(lens.near!==near){lens.near=near;lens.updateProjectionMatrix()}
    if(t<2.95||t>=5)return;
    const settle=smooth(2.95,3.35,t),push=smooth(3.35,4.45,t);
    const parallax=world.reducedMotion?0:1;
    scratch.pos.set(view.current.x*.9*parallax,.60+view.current.y*.5*parallax+smooth(4.35,4.75,t)*.16,lerp(6.9,6.5,settle)-push*.15-smooth(4.35,4.75,t)*1.8).add(ROSE_ORIGIN);
    scratch.target.set(.02,.53,0).add(ROSE_ORIGIN);
    if(t>=4.20){roseFollowCamera(t,scratch.pos,scratch.target);scratch.pos.add(ROSE_ORIGIN);scratch.target.add(ROSE_ORIGIN)}
    if(t>=4.5)rose.current.rotation.set(0,0,0);
    // Approach the real petal surface, then hold a fully covered frame.
    camera.position.copy(scratch.pos);camera.lookAt(scratch.target);
  });
  return <>
    <group ref={root} position={ROSE_ORIGIN} name="RoseScene">
      <mesh material={resources.backdrop} position={[0,.5,-12]}><planeGeometry args={[28,15.75]}/></mesh>
      <directionalLight ref={l=>{if(l)lights.current[0]=l}} target={resources.target} position={[-3,4,5]} color="#fff0ec" intensity={0}/>
      <directionalLight ref={l=>{if(l)lights.current[1]=l}} target={resources.target} position={[3,2,-2]} color="#ffd0b0" intensity={0}/>
      <directionalLight ref={l=>{if(l)lights.current[2]=l}} target={resources.target} position={[-4,1,2]} color="#b79dc3" intensity={0}/>
      <hemisphereLight ref={l=>{if(l)lights.current[3]=l}} color="#dba7b2" groundColor="#392130" intensity={0}/>
      <RoseManuscript motion={motion}/>
      <sprite ref={halo} position={[.1,.55,-1.5]} scale={5.8}><spriteMaterial map={resources.glow} color="#ffbd96" transparent opacity={.35} depthWrite={false} blending={THREE.AdditiveBlending}/></sprite>
      <RosePlanetoid/>
      <group ref={rose} position={[0,-.7,0]}><RoseVisual motion={motion}/></group>
      <group ref={petals} name="RoseForegroundPetals">{[0,1,2,3].map(i=><mesh key={i} geometry={resources.geo} material={resources.foreground}/>)}</group>
    </group>
    <RosePetalTransition view={view}/>
    <FoxDepthOfField focus={focus} interval={DOF_INTERVAL} nearRadius={25}/>
  </>;
}
