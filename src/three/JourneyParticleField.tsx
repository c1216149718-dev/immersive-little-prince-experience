import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { world, smooth, lerp } from "../state";
import { audio } from "../audio";
import { hash } from "./util";

export interface Footfall { x:number; z:number; t:number }
export interface Journey { prints:Footfall[] }
export const journeyX=(t:number)=>lerp(-8,2.8,smooth(10.55,11.30,t));
// The callback is driven by the authored Walk phase, not a timer or scroll event.
export function recordFootfall(journey:Journey,x:number,t:number) {
  const last=journey.prints.at(-1);
  if(last && x-last.x<.07)return;
  journey.prints.push({x:x-.07,z:-7+(journey.prints.length%2 ? .085:-.085),t});
}
// Explicit chapter selection reconstructs completed steps from the same gait distance.
// During playback only Prince.onStep appends footfalls.
export function restoreFootfalls(journey:Journey,t:number) {
  journey.prints.length=0;
  const end=journeyX(t);
  for(let x=-8+.207;x<end;x+=.207){
    let lo=10.55,hi=11.3;
    for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(journeyX(mid)<x)lo=mid;else hi=mid}
    recordFootfall(journey,x,(lo+hi)/2);
  }
}
const SHAPES=[
  [[-.57,.68],[-.49,.76],[-.39,.59],[-.46,.44],[-.60,.51],[-.57,.68]],
  [[-.72,-.34],[-.66,-.60],[-.49,-.71],[-.55,-.43],[-.64,-.22],[-.72,-.34]],
  [[.43,.62],[.54,.55],[.67,.68],[.75,.86],[.67,.68],[.65,.48],[.54,.43],[.54,.55]],
  [[.76,-.13],[.84,-.08],[.86,-.25],[.76,-.13]],
  [[.52,-.53],[.59,-.43],[.68,-.66],[.76,-.73],[.68,-.66],[.57,-.77],[.52,-.53]],
];

export function JourneyParticleField({journey,height}:{journey:Journey;height:(x:number,z:number)=>number}) {
  const root=useRef<THREE.Group>(null!);
  const prints=useRef<THREE.InstancedMesh>(null!);
  const selected=useRef(-1);
  const response=useRef({x:0,y:0,lastX:0,lastY:0,energy:0,version:world.replayVersion});
  const offsets=useMemo(()=>new Float32Array(1600*2),[]);
  const data=useMemo(()=>{
    const nodes:number[][]=[],edges:number[][]=[];
    SHAPES.forEach(shape=>{const indices:number[]=[];shape.forEach(p=>{let i=nodes.findIndex(n=>n[0]===p[0]&&n[1]===p[1]);if(i<0){i=nodes.length;nodes.push(p)}indices.push(i)});for(let i=1;i<indices.length;i++)edges.push([indices[i-1],indices[i]])});
    nodes.push([.08,.29]); // a quiet guiding star above the text
    const count=1600;
    const geo=new THREE.BufferGeometry(),positions=new Float32Array(count*3),alpha=new Float32Array(count),size=new Float32Array(count);
    geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),300);
    geo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize',new THREE.BufferAttribute(size,1).setUsage(THREE.DynamicDrawUsage));
    const targets=Array.from({length:count},(_,i)=>{
      if(i<nodes.length)return nodes[i];
      const x=hash(i*7.31)*2-1;
      // The faint remainder forms an irregular diagonal dust band, leaving text clear.
      const y=i<540?hash(i*5.13)*2-1:x*1.1+(hash(i*3.37)-.5)*.5;
      return [x,y];
    });
    const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(edges.length*6),3).setUsage(THREE.DynamicDrawUsage));
    return {geo,lg,positions,alpha,size,nodes,edges,targets,count};
  },[]);
  const material=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uPR:{value:world.dpr},uWhite:{value:0}},
    vertexShader:`attribute float aAlpha,aSize;uniform float uPR,uWhite;varying float vA,vStar;
      void main(){vA=aAlpha;vStar=step(15.,aSize)*uWhite;vec4 mv=modelViewMatrix*vec4(position,1.);
      gl_Position=projectionMatrix*mv;float depthScale=mix(clamp(22./max(1.,-mv.z),.65,1.6),1.,uWhite);
      gl_PointSize=aSize*uPR*depthScale;}`,
    fragmentShader:`uniform float uWhite;varying float vA,vStar;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p);
      float core=exp(-dot(p,p)*170.);
      float halo=exp(-dot(p,p)*24.)*.19;
      float rays=(exp(-abs(p.x)*155.-abs(p.y)*11.)+exp(-abs(p.y)*155.-abs(p.x)*11.))*.22*vStar;
      float edge=1.-smoothstep(.38,.5,r);
      vec3 c=mix(vec3(1.5,.80,.22),vec3(1.5,1.26,.87),uWhite);
      gl_FragColor=vec4(c,(core+halo+rays)*vA*edge);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`

  }),[]);
  const footprint=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float d=length(p*vec2(1.,1.+p.x*.18));float body=1.-smoothstep(.68,.94,d);float rim=exp(-pow((d-.85)*22.,2.));gl_FragColor=vec4(mix(vec3(.035,.045,.07),vec3(.48,.30,.12),rim*.5),body*.48+rim*.1);}`
  }),[]);
  const lineMat=useMemo(()=>new THREE.LineBasicMaterial({color:'#d8ba88',transparent:true,opacity:.52,depthWrite:false}),[]);
  const band=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,
    uniforms:{uReveal:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float uReveal;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vUv*2.-1.;float offset=p.y-p.x*.9-sin(p.x*5.)*.07;
      float cloud=n(p*12.)*.55+n(p*28.)*.28+n(p*66.)*.17;
      float dust=exp(-pow(offset/(.10+cloud*.16),2.))*pow(cloud,1.5);
      float edge=(1.-smoothstep(.62,1.,abs(p.x)))*(1.-smoothstep(.65,1.,abs(p.y)));
      float quiet=mix(.38,1.,smoothstep(.12,.4,length(p*vec2(1.,2.))));
      gl_FragColor=vec4(mix(vec3(.28,.35,.52),vec3(.63,.49,.32),cloud),dust*edge*quiet*uReveal*.22);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`}),[]);
  const bandMesh=useRef<THREE.Mesh>(null!);
  const scratch=useMemo(()=>({dummy:new THREE.Object3D(),q:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0,1.8,10),new THREE.Vector3(.8,35,-6),new THREE.Vector3(0,1,0))),origin:new THREE.Vector3(0,1.8,10),target:new THREE.Vector3(),p:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),normal:new THREE.Vector3(),settled:Array.from({length:data.nodes.length},()=>new THREE.Vector3())}),[data]);
  useEffect(()=>()=>{data.geo.dispose();data.lg.dispose();material.dispose();footprint.dispose();lineMat.dispose();band.dispose()},[data,material,footprint,lineMat,band]);
  useFrame(({camera,clock},delta)=>{
    const dt=Math.min(delta,.05),r=response.current;
    if(r.version!==world.replayVersion||world.t<12.66){r.x=r.y=r.energy=0;r.version=world.replayVersion;offsets.fill(0)}
    const movement=Math.hypot(world.mouse.x-r.lastX,world.mouse.y-r.lastY);
    r.lastX=world.mouse.x;r.lastY=world.mouse.y;
    const enabled=world.reducedMotion?0:smooth(12.86,13,world.t);
    if(!world.playbackPaused){
      r.energy=Math.max(r.energy*Math.exp(-dt*1.2),Math.min(1,movement*16))*enabled;
      r.x+=(world.mouse.x*r.energy*.014-r.x)*(1-Math.exp(-dt*2));
      r.y+=(world.mouse.y*r.energy*.014-r.y)*(1-Math.exp(-dt*2));
    }
    if(!enabled){r.x=r.y=r.energy=0;offsets.fill(0)}
    const t=world.t;root.current.visible=t>10.5;
    const active=world.reducedMotion?480:data.count;
    const rise=smooth(11.48,12.24,t),settle=smooth(12.12,12.66,t);
    const aspect=(camera as THREE.PerspectiveCamera).aspect;
    const half=120*Math.tan(42*Math.PI/360);
    band.uniforms.uReveal.value=smooth(12.30,12.78,t);
    bandMesh.current.position.set(r.x*half*aspect*.2,r.y*half*.2,-145).applyQuaternion(scratch.q).add(scratch.origin);
    bandMesh.current.quaternion.copy(scratch.q);bandMesh.current.scale.set(half*aspect*2.5,half*2.5,1);
    const targetAt=(i:number,out:THREE.Vector3)=>{
      const [x,y]=data.targets[i],node=i<data.nodes.length;
      const distance=Math.hypot(world.mouse.x-x,world.mouse.y-y);
      const pull=(1-smooth(0,.6,distance))*r.energy*.09;
      const ox=node?r.x:i<540?(world.mouse.x-x)*pull:r.x*.2;
      const oy=node?r.y:i<540?(world.mouse.y-y)*pull:r.y*.2;
      if(!world.playbackPaused){const a=1-Math.exp(-dt*2.3);offsets[i*2]+=(ox-offsets[i*2])*a;offsets[i*2+1]+=(oy-offsets[i*2+1])*a}
      return out.set((x+offsets[i*2])*half*aspect,(y+offsets[i*2+1])*half,-120).applyQuaternion(scratch.q).add(scratch.origin);
    };
    const lp=journey.prints.length;
    prints.current.count=Math.min(lp,80);
    journey.prints.slice(0,80).forEach((f,i)=>{
      const d=scratch.dummy;d.position.set(f.x,height(f.x,f.z)+.012,f.z);
      scratch.normal.set((height(f.x-.02,f.z)-height(f.x+.02,f.z))/.04,1,(height(f.x,f.z-.02)-height(f.x,f.z+.02))/.04).normalize();
      d.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),scratch.normal);d.scale.set(.17,.075,1);d.updateMatrix();prints.current.setMatrixAt(i,d.matrix);
    });prints.current.instanceMatrix.needsUpdate=true;
    for(let i=0;i<data.count;i++){
      const seed=hash(i*1.717+3.2),f=journey.prints[i%52];
      targetAt(i,scratch.target);
      const isNode=i<data.nodes.length;
      if(isNode)scratch.settled[i].copy(scratch.target);
      const age=f?Math.max(0,t-f.t):0;
      const x=f?.x??-8,z=f?.z??-7,y=height(x,z);
      const duration=4.0+hash(i*6.73)*4.5;
      const ageSeconds=Math.max(0,(Math.min(t,11.48)-(f?.t??t))*12-seed*.9);
      const flight=(ageSeconds%duration)/duration;
      const born=smooth(0,.06,age);
      // Fade a grain before recycling at its own footprint; once the camera lifts,
      // keep that flight and that identity all the way to its permanent star target.
      const lifeAlpha=smooth(0,.10,flight)*(1-smooth(.78,1,flight));
      const lift=(world.reducedMotion?.28:1)*flight*(2.8+seed*4.7);
      const scatter=hash(i*4.83)>.85?1.8:.35;
      const wind=world.reducedMotion?0:Math.sin(lift*.75+x*.55)*(.10+lift*.15)+Math.sin(age*5+seed*19)*.10;
      const drift=(hash(i*3.31)-.5)*(lift*.23+rise*2)*scatter;
      scratch.p.set(x+wind+drift+rise*(seed-.5)*3,y+lift+rise*(8+seed*26),z+(hash(i*2.19)-.5)*(.25+lift*.35)-rise*seed*8);
      const individual=smooth(12.08+seed*.14,12.55+seed*.1,t);
      scratch.p.lerp(scratch.target,individual);
      if(i>=1560)scratch.p.copy(scratch.target);
      scratch.p.toArray(data.positions,i*3);
      const old=Math.exp(-age*1.4),groundAlpha=(.60+old*.5)*born*lerp(lifeAlpha,.85,rise)*(.50+.50*Math.pow(.5+.5*Math.sin(x*1.5),3));
      let a=f?lerp(groundAlpha,isNode? 1.4:i<540?.50+seed*.65:.15+seed*.26,individual):0;
      if(i>=1560)a=smooth(10.9,11.3,t)*lerp(.10,.4,individual);
      if(i>=active)a=0;
      // Give the settled sky quiet negative space around the final sentence.
      if(!isNode&&Math.abs(data.targets[i][0])<.40&&Math.abs(data.targets[i][1])<.16)a*=1-settle*.86;
      const breathing=isNode&&!world.reducedMotion?.90+.10*Math.sin(clock.elapsedTime*.9+seed*5):1;
      data.alpha[i]=a*breathing*(selected.current===i?1.8:1);
      data.size[i]=(selected.current===i?1.35:1)*lerp(7+seed*5,isNode?(i===data.nodes.length-1||i===0||i===12?38:18+seed*6):i<540?3.5+seed*4:2.8,individual);
    }
    data.geo.setDrawRange(0,active);
    data.geo.attributes.position.needsUpdate=true;data.geo.attributes.aAlpha.needsUpdate=true;data.geo.attributes.aSize.needsUpdate=true;
    material.uniforms.uPR.value=world.dpr;material.uniforms.uWhite.value=settle;
    const lines=data.lg.attributes.position.array as Float32Array;
    const draw=smooth(12.68,12.86,t)*data.edges.length;
    data.edges.forEach(([a,b],i)=>{scratch.settled[a].toArray(lines,i*6);scratch.p.copy(scratch.settled[a]).lerp(scratch.settled[b],Math.min(1,Math.max(0,draw-i))).toArray(lines,i*6+3)});
    data.lg.attributes.position.needsUpdate=true;data.lg.setDrawRange(0,Math.ceil(draw)*2);
    root.current.userData.footfalls=lp;root.current.userData.settled=settle;root.current.userData.edges=Math.floor(draw);
  });
  return <group ref={root} name="JourneyParticleField">
    <mesh ref={bandMesh} name="JourneyMilkyDust" material={band} frustumCulled={false}><planeGeometry args={[1,1]}/></mesh>
    <instancedMesh ref={prints} name="JourneyFootprints" args={[undefined,footprint,80]} frustumCulled={false}><planeGeometry args={[1,1]}/></instancedMesh>
    <points name="JourneySandToStars" geometry={data.geo} material={material} frustumCulled={false} onClick={event=>{if(world.t<12.66 || event.index===undefined)return;event.stopPropagation();selected.current=event.index;audio.chime(.8+hash(event.index)*.6)}}/>
    <lineSegments name="JourneyConstellations" geometry={data.lg} material={lineMat} frustumCulled={false}/>
  </group>;
}
