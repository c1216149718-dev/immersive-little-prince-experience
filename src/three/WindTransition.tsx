import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { world, smooth } from "../state";
import { hash } from "./util";

/** Story-time wind: replaying a chapter reconstructs the same gust and fragments. */
export function WindTransition({ origin }: { origin: THREE.Vector3 }) {
  const curtain = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uPhase: { value: 0 }, uStrength: { value: 0 }, uSand: { value: 0 }, uPR: { value: world.dpr } }), []);
  const geometry = useMemo(() => {
    const n = Math.floor(1000 * world.quality), p = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (hash(i * 3.17 + 1) - .5) * 32;
      p[i * 3 + 1] = hash(i * 7.13 + 2) * 3.8;
      p[i * 3 + 2] = 5 - hash(i * 2.71 + 3) * 25;
      seed[i] = hash(i * 11.3 + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const fragments = useMemo(() => new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `attribute float aSeed; uniform float uPhase,uStrength,uSand,uPR; varying float vSeed,vAlpha;
      void main(){ vec3 p=position; p.x=mod(p.x+16.0+uPhase*(9.0+aSeed*7.0),32.0)-16.0;
        p.y+=sin(uPhase*3.0+aSeed*16.0)*.4+uPhase*.5;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(mix(20.0,4.0,uSand)*uPR*(5.0/max(2.0,-mv.z)),1.0,28.0);
        vSeed=aSeed; vAlpha=uStrength*smoothstep(0.8,3.0,-mv.z)*(.35+aSeed*.4); }`,
    fragmentShader: `uniform float uSand; varying float vSeed,vAlpha;
      void main(){ vec2 p=gl_PointCoord-.5; float a=vSeed*6.28;
        p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; p.x*=mix(3.4,1.0,uSand);
        float shape=1.0-smoothstep(.18,.5,length(p));
        gl_FragColor=vec4(mix(vec3(.58,.46,.22),vec3(.85,.73,.53),uSand),shape*vAlpha); }`
  }), [uniforms]);
  const veil = useMemo(() => new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uPhase,uStrength; varying vec2 vUv;
      void main(){vec2 p=vUv; float bands=.55+.22*sin(p.y*14.0+p.x*3.0-uPhase*4.0)+.12*sin(p.y*29.0-p.x*5.0+uPhase*3.0);
        float edge=smoothstep(0.0,.16,p.y)*(1.0-smoothstep(.55,.96,p.y));
        float sweep=.5+.5*sin(p.x*5.0-uPhase*3.0);
        gl_FragColor=vec4(vec3(.70,.57,.39),uStrength*edge*bands*(.65+.25*sweep)); }`
  }), [uniforms]);
  useEffect(() => () => { geometry.dispose(); fragments.dispose(); veil.dispose(); }, [geometry, fragments, veil]);
  useFrame(({ camera }) => {
    const t = world.t;
    uniforms.uPhase.value = Math.max(0, t - 9.72) * 4;
    uniforms.uSand.value = smooth(10.05, 10.65, t);
    uniforms.uStrength.value = world.reducedMotion ? 0 : smooth(9.74, 10.22, t) * (1 - smooth(10.72, 11.03, t));
    curtain.current.position.copy(camera.position).sub(origin);
    curtain.current.quaternion.copy(camera.quaternion);
    curtain.current.translateZ(-2.5);
    curtain.current.scale.set((camera as THREE.PerspectiveCamera).aspect * 2.4, 2.4, 1);
  });
  return <><points geometry={geometry} material={fragments} frustumCulled={false} />
    <mesh ref={curtain} material={veil} renderOrder={8} frustumCulled={false}><planeGeometry args={[1,1]} /></mesh></>;
}
