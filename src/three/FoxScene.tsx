import { RiggedFox as Fox, type FoxState } from "./RiggedFox";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { world, useUI, T, smooth, damp, lerp } from "../state";
import { hash, glowTexture, starSpriteTexture } from "./util";
import { Prince, makeRig } from "./Prince";
import { audio } from "../audio";
import { WheatField } from "./WheatField";
import { FoxDepthOfField } from "./FoxDepthOfField";
import { PaperStage } from "./paper/PaperStage";
import { JourneyParticleField, journeyX, recordFootfall, restoreFootfalls, type Journey } from "./JourneyParticleField";
import { createSunDiscMaterial } from "./sunDisc";

export const FOX_ORIGIN = new THREE.Vector3(0, 600, 0);

const DUNE_GLSL = /* glsl */ `
float dune(vec2 p){
  float d = sin(p.x * 0.11 + p.y * 0.05) * 1.4;
  d += sin(p.x * 0.23 - p.y * 0.17 + 1.7) * 0.7;
  d += sin(p.y * 0.31 + p.x * 0.07 + 0.4) * 0.45;
  d += sin(p.x * 0.9 + p.y * 1.1) * 0.06;
  return d;
}`;
function duneJS(x: number, z: number) {
  let d = Math.sin(x * 0.11 + z * 0.05) * 1.4;
  d += Math.sin(x * 0.23 - z * 0.17 + 1.7) * 0.7;
  d += Math.sin(z * 0.31 + x * 0.07 + 0.4) * 0.45;
  d += Math.sin(x * 0.9 + z * 1.1) * 0.06;
  return d;
}
/** dune height at a world x/z (the ground plane is rotated -90° about X and sits at z = -20) */
const duneWorld = (x: number, z: number) => duneJS(x, -z - 20);

/* ---------------- ground: soil under wheat that rises into dunes ---------------- */
function Ground({ sand, contacts }: { sand: { value: number }; contacts: { value: THREE.Vector4[] } }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 });
    const u = { uSand: sand, uContacts: contacts };
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = `uniform float uSand; varying vec3 vWp; ${DUNE_GLSL}\n` + s.vertexShader
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
          { float e = 0.35; vec2 p = position.xy;
            float hC = dune(p) * uSand, hX = dune(p + vec2(e,0.0)) * uSand, hY = dune(p + vec2(0.0,e)) * uSand;
            objectNormal = normalize(vec3(hC - hX, hC - hY, e)); }`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed.z += dune(position.xy) * uSand;
          vWp = transformed;`);
      s.fragmentShader = `uniform float uSand; uniform vec4 uContacts[2]; varying vec3 vWp; ${DUNE_GLSL}\n` + s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float soilVariation = sin(vWp.x * 0.37 + sin(vWp.y * 0.21)) * sin(vWp.y * 0.29);
        vec3 soil = mix(vec3(0.37, 0.23, 0.095), vec3(0.58, 0.38, 0.17), soilVariation * 0.5 + 0.5);
        vec3 sandA = vec3(0.49, 0.49, 0.59);
        vec3 sandB = vec3(0.27, 0.30, 0.42);
        float ripple = sin(vWp.x * 22.0 + vWp.y * 6.0 + sin(vWp.y * 0.8) * 2.0);
        float rippleFade = 1.0 - smoothstep(12.0, 38.0, length(vViewPosition));
        vec3 sandC = mix(sandB, sandA, 0.68 - smoothstep(0.0, 1.5, dune(vWp.xy) * -0.5) * 0.22);
        sandC += ripple * 0.012 * rippleFade;
        float soilGrain=sin(vWp.x*41.+sin(vWp.y*27.))*sin(vWp.y*53.)*.018;
        vec2 cell=floor(vWp.xy*12.);
        float seed=fract(sin(dot(cell,vec2(12.98,78.23)))*43758.54);
        vec2 local=fract(vWp.xy*12.)-.5;
        float straw=(1.-smoothstep(.025,.075,abs(local.x+local.y*(seed-.5))))*(1.-smoothstep(.25,.45,abs(local.y)))*step(.55,seed);
        soil=mix(soil,vec3(.57,.37,.13),straw*.45);
        soil += soilGrain * (1.-smoothstep(10.,30.,length(vViewPosition)));
        diffuseColor.rgb = mix(soil, sandC, uSand);
        vec2 groundXZ=vec2(vWp.x,-vWp.y-20.);
        for(int i=0;i<2;i++){
          vec2 delta=(groundXZ-uContacts[i].xy)/vec2(.62,1.05);
          float contact=exp(-dot(delta,delta)*2.)*uContacts[i].z;
          diffuseColor.rgb*=1.-contact*.38;
        }
        float haze = smoothstep(18.0, 75.0, length(vViewPosition)) * 0.28;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.61,.59,.54),vec3(.30,.33,.43),uSand),haze);`
      );
      s.fragmentShader=s.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        float bump=sin(vWp.x*22.+vWp.y*6.+sin(vWp.y*.8)*2.)*.006*uSand*(1.-smoothstep(10.,30.,length(vViewPosition)));
        vec3 dx=dFdx(vViewPosition),dy=dFdy(vViewPosition);
        vec3 sx=cross(dy,normal),sy=cross(normal,dx);float determinant=dot(dx,sx);
        vec3 gradient=sign(determinant)*(dFdx(bump)*sx+dFdy(bump)*sy);
        normal=normalize(abs(determinant)*normal-gradient);
      `);
    };
    (m as any).userData.u = u;
    return m;
  }, [sand, contacts]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} material={mat}>
      <planeGeometry args={[160, 160, 240, 240]} />
    </mesh>
  );
}

/* ---------------- sand grains drifting in the wind ---------------- */
function Sand({ count, sand, cursor }: { count: number; sand: { value: number }; cursor: { value: THREE.Vector3 } }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (hash(i * 1.1) - 0.5) * 40;
      pos[i * 3 + 1] = hash(i * 2.2) * 1.6;
      pos[i * 3 + 2] = 6 - hash(i * 3.3) * 34;
      seed[i] = hash(i * 4.4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uSand: sand, uCursor: cursor, uMap: { value: starSpriteTexture(64) }, uPR: { value: world.dpr } },
        vertexShader: `attribute float aSeed; uniform float uTime, uSand, uPR; uniform vec3 uCursor; varying float vA;
          ${DUNE_GLSL}
          void main(){
            vec3 p = position;
            p.x += mod(uTime * (0.4 + aSeed * 0.8) + aSeed * 40.0, 40.0) - 20.0;
            p.y += sin(uTime * (0.8 + aSeed) + aSeed * 12.0) * 0.15;
            vec3 d = p - uCursor;
            float len = length(d.xz);
            float inf = smoothstep(2.2, 0.0, len);
            p.xz += normalize(d.xz + 0.0001) * inf * 0.9;
            p.y += inf * 0.6 + dune(vec2(p.x, -p.z - 20.0)) * uSand;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (1.5 + aSeed * 2.0) * uPR * (8.0 / max(1.0, -mv.z));
            vA = uSand * (0.25 + inf * 0.5) * smoothstep(-40.0, -4.0, mv.z);
          }`,
        fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ vec4 s = texture2D(uMap, gl_PointCoord); gl_FragColor = sRGBTransferEOTF(vec4(vec3(0.95, 0.86, 0.7), s.a * vA));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    [sand, cursor]
  );
  useEffect(() => () => { geo.dispose(); mat.uniforms.uMap.value.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((state) => { mat.uniforms.uTime.value = world.reducedMotion ? 0 : state.clock.elapsedTime; });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ---------------- the fox ---------------- */
/* ---------------- a distant wreck, half-swallowed by sand ---------------- */
function Wreck() {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3b3a46", roughness: 0.95 }), []);
  useEffect(() => () => m.dispose(), [m]);
  const y = duneWorld(-27, -60) - 0.3;
  return (
    <group scale={.35} position={[-27, y, -60]} rotation={[0.15, 0.6, -0.12]}>
      <mesh material={m} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.55, 0.35, 5.5, 12]} /></mesh>
      <mesh material={m} position={[0.4, 0.2, 0]} rotation={[0.1, 0, 0]}><boxGeometry args={[1.2, 0.08, 7]} /></mesh>
      <mesh material={m} position={[-2.7, 0.9, 0]}><boxGeometry args={[0.6, 1.6, 0.08]} /></mesh>
      <mesh material={m} position={[2.9, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.35, 0.8, 10]} /></mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={m} position={[2.9, 0, 0]} rotation={[(i * Math.PI * 2) / 3, 0, 0]}><boxGeometry args={[0.05, 0.12, 1.6]} /></mesh>
      ))}
    </group>
  );
}

const FOX_LINES: [number, string][] = [
  [0.02, "The fox is watching. To him, you are still a hundred thousand others."],
  [0.3, "Sit a little closer each day. Say nothing. Words are the source of misunderstandings."],
  [0.62, "He has begun to know the sound of your step."],
  [0.97, "One only understands the things one tames."],
];
const STARTLE_LINE = "Too fast. He goes back into the wheat.";

export function FoxScene() {
  const { camera } = useThree();
  useEffect(()=>{const c=camera as THREE.PerspectiveCamera;const previous=c.fov;return()=>{c.fov=previous;c.updateProjectionMatrix()}},[camera]);
  const sand = useMemo(() => ({ value: 0 }), []);
  const focus = useMemo(() => new THREE.Vector3(0,600.5,-7), []);
  const contacts = useMemo(() => ({value:[new THREE.Vector4(),new THREE.Vector4()]}), []);
  const cursor = useMemo(() => ({ value: new THREE.Vector3(0, 600, -30) }), []);
  const sun = useRef<THREE.DirectionalLight>(null!);
  // Light targets are world-space objects; inherit the same translated scene origin.
  const faceFill = useRef<THREE.DirectionalLight>(null!);
  const sunTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(0, 0, -7);
    return target;
  }, []);
  const sunSprite = useRef<THREE.Sprite>(null!);
  const sunDisc = useRef<THREE.Mesh>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const backdrop = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uNight: { value: 0 }, uStars: { value: 0 }, uLift: { value: 0 } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uNight,uStars,uLift; varying vec3 vP;
          float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float skyNoise(vec2 p){
            vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
            return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1)),f.x),f.y);
          }
          float skyCloud(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=skyNoise(p)*a;p=p*2.07+vec2(4.3,1.7);a*=.5;}return n;}

          void main(){
            float h = clamp(normalize(vP).y, -0.2, 1.0);
            vec3 dayTop = vec3(0.17, 0.25, 0.40);
            vec3 dayMid = vec3(0.58, 0.53, 0.52);
            vec3 dayHor = vec3(0.94, 0.70, 0.42);
            vec3 day = mix(dayHor, dayMid, smoothstep(0.0, 0.12, h));
            day = mix(day, dayTop, smoothstep(0.04, 0.34, h));
            vec3 nightTop = vec3(0.22, 0.27, 0.39);
            vec3 nightHor = vec3(0.87, 0.59, 0.34);
            vec3 night = mix(nightHor, nightTop, smoothstep(0.0, 0.27, h));
            vec3 dir = normalize(vP);
            vec2 skyUV=vec2(atan(dir.x,-dir.z)*5.,h*13.);
            float n=skyCloud(skyUV*vec2(1.3,2.2));
            float cloudBand=smoothstep(.01,.045,h)*(1.-smoothstep(.25,.46,h));
            float mass=smoothstep(.48,.68,n)*cloudBand;
            float edge=max(0.,n-skyCloud(skyUV*vec2(1.3,2.2)+vec2(.055,.08)))*7.;
            vec3 cloudShade=mix(vec3(.28,.30,.37),vec3(.89,.55,.29),clamp(edge+1.-h*4.,0.,1.));
            day=mix(day,cloudShade,mass*.68);
            float glow=pow(max(0.,dot(dir,normalize(vec3(25.,5.3,-70.)))),90.);
            day+=vec3(.20,.085,.015)*glow;
            float ridge=.012+skyNoise(vec2(dir.x*14.,2.3))*.023+skyNoise(vec2(dir.x*36.,7.))* .007;
            float hill=1.-smoothstep(ridge-.004,ridge+.003,h);
            day=mix(day,vec3(.39,.34,.31),hill*.8);
            vec3 liftSky=mix(vec3(.32,.40,.53),vec3(.12,.18,.30),smoothstep(-.04,.38,h));
            liftSky=mix(liftSky,vec3(.045,.068,.12),smoothstep(.28,.82,h));
            night=mix(night,liftSky,uLift);
            night=mix(night,mix(vec3(.09,.12,.20),vec3(.045,.066,.12),smoothstep(0.,1.,h)),uStars);
            gl_FragColor = sRGBTransferEOTF(vec4(mix(day, night, uNight), 1.0));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    []
  );
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  const sunTex = useMemo(() => glowTexture(256, "rgba(255,225,170,1)", "rgba(255,170,90,0)", 1.6), []);
  const discMaterial = useMemo(() => {
    const material=createSunDiscMaterial();
    material.fragmentShader=material.fragmentShader.replace("gl_FragColor=vec4(c,edge*uOpacity);",`gl_FragColor=sRGBTransferEOTF(vec4(c,edge*uOpacity));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>`);
    return material;
  }, []);
  useEffect(() => () => { sunTex.dispose(); discMaterial.dispose(); }, [sunTex, discMaterial]);
  const rig = useMemo(makeRig, []);
  const journey = useMemo<Journey>(()=>{const j={prints:[]};restoreFootfalls(j,world.t);return j},[]);
  const princeG = useRef<THREE.Group>(null!);
  const fs = useRef<FoxState>({ z: -5.5, x: 0.25, trust: 0, sit: 0, walk: 0, startle: 0, lastLine: -1, lineT: 0, leaving: 0, phase: 0 });
  const cam = useRef({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), init: false });
  const speedS = useRef(0);
  const foxGround = useRef<THREE.Group>(null!);
  const departure = useRef({ x: .25, z: -5.5 });
  const previousT = useRef(world.t);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -FOX_ORIGIN.y), []);
  const q = world.quality;

  useEffect(() => {
    rig.lookUp = 1;
    const x = journeyX(world.t);
    princeG.current.position.set(x, duneWorld(x, -7) * smooth(10.04,10.96,world.t) - 0.02, -7);
    princeG.current.rotation.y = -0.4;
    princeG.current.scale.setScalar(1.15);
  }, [rig]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = world.t;
    const time = state.clock.elapsedTime;
    const jumped = Math.abs(t - previousT.current) > .25;
    previousT.current = t;
    const ui = useUI.getState();

    /* morph & night */
    const sandK = smooth(10.04, 10.96, t);
    sand.value = sandK;
    const night = smooth(T.SAND + 0.2, T.DESERT, t);
    backdrop.uniforms.uNight.value = night;
    backdrop.uniforms.uStars.value = smooth(12.10,12.70,t);
    backdrop.uniforms.uLift.value = smooth(11.45,11.85,t);
    const sunEl = lerp(0.14, -0.12, night);
    sun.current.position.set(lerp(30,-18,night), lerp(Math.sin(sunEl)*60,28,night), -50);
    const lf = smooth(8.86, 9.0, t); // lights are global: arrive with the golden light
    sun.current.intensity = lerp(3.6, 1.05, night) * lf;
    sun.current.color.set("#ffc578").lerp(new THREE.Color("#efd3af"), night);
    hemi.current.intensity = lerp(0.32, 0.48, night) * lf;
    faceFill.current.intensity = lerp(.72, 1.1, night) * lf;
    (hemi.current.color as THREE.Color).set("#aabccc").lerp(new THREE.Color("#8795b9"), night);
    (hemi.current.groundColor as THREE.Color).set("#6a4a2a").lerp(new THREE.Color("#554738"), night);
    sunSprite.current.position.set(25, lerp(5.3,-8,night), -70);
    (sunSprite.current.material as THREE.SpriteMaterial).opacity = (1 - night) * 0.22;
    sunDisc.current.position.copy(sunSprite.current.position);
    sunDisc.current.quaternion.copy(camera.quaternion);
    discMaterial.uniforms.uOpacity.value = 1 - night;

    /* cursor → ground point */
    ray.setFromCamera(world.mouse, camera);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (hit) {
      hit.sub(FOX_ORIGIN);
      hit.z = Math.max(-40, hit.z);
      cursor.value.lerp(hit, damp(6, dt));
    }

    /* fox behaviour: your speed decides */
    const f = fs.current;
    speedS.current += (world.mouseSpeed - speedS.current) * damp(4, dt);
    const inFox = t > T.FOX - 0.2 && t < T.SAND + 0.1;
    if (inFox && world.mouseActive) {
      const sp = speedS.current;
      const nearFox = Math.hypot(cursor.value.x - f.x, cursor.value.z - f.z) < 4;
      if (sp > 1500 && f.startle < 0.05 && f.trust > 0.05) {
        f.startle = 1;
        f.trust = Math.max(0, f.trust - 0.18);
        ui.set({ foxLine: STARTLE_LINE });
        f.lineT = time;
      } else if (sp > 700) {
        f.trust = Math.max(0, f.trust - dt * (nearFox ? 0.22 : 0.09));
      } else if (sp > 6 && sp < 320) {
        f.trust = Math.min(1, f.trust + dt * (nearFox ? 0.05 : 0.075));
      } else if (sp <= 6) {
        f.trust = Math.min(1, f.trust + dt * 0.012);
      }
    }
    f.startle = Math.max(0, f.startle - dt * 1.4);
    world.foxTrust = f.trust;
    // distance follows trust; retreating is quicker than approaching
    f.leaving = smooth(T.SAND - 0.15, T.SAND + 0.35, t);
    const wantZ = lerp(-5.5, -2.1, smooth(0, 1, f.trust)) - f.startle * 2.5;
    const rate = wantZ < f.z ? 2.2 : 0.55;
    const prevZ = f.z, prevX = f.x;
    f.z += (wantZ - f.z) * damp(rate, dt);
    const approachX = .25 - f.trust * .1 + Math.sin(f.z * .8) * .06;
    // The departure occupies one authored shot, including on chapter skip/replay.
    if (t < 10.13) {
      f.x += (approachX - f.x) * damp(1, dt);
      departure.current = { x: f.x, z: f.z };
    } else {
      const exit = smooth(10.13, 10.98, t);
      f.x = lerp(departure.current.x, 14, exit);
      f.z = lerp(departure.current.z, -12, exit);
      f.leaving = exit >= 1 ? 1 : Math.min(f.leaving, .998);
    }
    foxGround.current.position.y = duneWorld(f.x, f.z) * sandK;
    f.walk = jumped ? 0 : Math.min(1, Math.hypot(f.z - prevZ, f.x - prevX) / Math.max(dt, 0.001) / 0.9);
    f.sit = f.leaving === 0 && f.trust > 0.95 && Math.abs(f.z - wantZ) < 0.15 ? 1 : 0;
    world.foxDist = smooth(-2.1, -5.5, f.z);
    // lines
    if (inFox) {
      for (let i = FOX_LINES.length - 1; i >= 0; i--) {
        if (f.trust >= FOX_LINES[i][0] && f.lastLine < i && time - f.lineT > 4) {
          f.lastLine = i;
          f.lineT = time;
          ui.set({ foxLine: FOX_LINES[i][1] });
          if (i === 3) audio.chime(1.2);
          break;
        }
      }
      if (ui.foxLine && time - f.lineT > 7) ui.set({ foxLine: null });
    } else if (ui.foxLine) ui.set({ foxLine: null });

    /* A real walk from screen left, followed by a breath before looking up. */
    princeG.current.visible = t >= 10.55;
    const previousPrinceX = princeG.current.position.x;
    const princeX = journeyX(t);
    princeG.current.position.set(princeX,duneWorld(princeX,-7)*sandK-.02,-7);
    if(jumped)restoreFootfalls(journey,t);
    rig.speed = jumped ? 0 : Math.max(0,(princeX-previousPrinceX)/Math.max(dt,.001))/1.15;
    rig.walk = Math.min(1,rig.speed/.15);
    rig.lookUp = smooth(11.36,11.58,t);
    princeG.current.rotation.y = lerp(-Math.PI/2,-.35,smooth(11.30,11.55,t));

    contacts.value[0].set(f.x,f.z,1-smooth(10.7,10.98,t),0);
    contacts.value[1].set(princeX,-7,smooth(10.43,10.57,t),0);
    focus.set(lerp(f.x,princeX,smooth(10.35,10.85,t)),600.55,lerp(f.z,-7,smooth(10.35,10.85,t)));
    /* camera */
    if (t < T.FOX) return;
    const mx = world.reducedMotion ? 0 : world.mouse.x * .25, my = world.reducedMotion ? 0 : world.mouse.y * .5;
    const lookUp = smooth(11.50,12.58,t);
    const settle = smooth(T.FOX, T.FOX + 0.4, t);
    const desertFrame=smooth(10.5,11.05,t);
    const returnToDesert=smooth(10.45,11.05,t);
    const lens=camera as THREE.PerspectiveCamera;
    const desiredFov=lerp(34,42,returnToDesert);
    if(Math.abs(lens.fov-desiredFov)>.001){lens.fov=desiredFov;lens.updateProjectionMatrix()}
    const desired = new THREE.Vector3(mx*.4*(1-desertFrame), lerp(1.05,1.8,desertFrame)+my*.15*(1-desertFrame)+(1-settle)*.55, lerp(5.8,10,desertFrame)+(1-settle)*.35).add(FOX_ORIGIN);
    const target = new THREE.Vector3(lerp(.4,.8,desertFrame)+mx*1.5*(1-desertFrame), lerp(lerp(.55,2.2,desertFrame),35,lookUp)+my*.6*(1-desertFrame),-6).add(FOX_ORIGIN);
    const c = cam.current;
    if (!c.init || t < T.FOX + 0.02) { c.pos.copy(desired); c.tgt.copy(target); c.init = true; }
    c.pos.lerp(desired, damp(3.5, dt));
    c.tgt.lerp(target, damp(3, dt));
    camera.position.copy(c.pos);
    const qq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(c.pos, c.tgt, new THREE.Vector3(0, 1, 0)));
    camera.quaternion.slerp(qq, damp(4, dt));
  });

  return (
    <group name="FoxDesertScene" position={FOX_ORIGIN}>
      <mesh material={backdrop} scale={220} renderOrder={-20}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <primitive object={sunTarget} />
      <directionalLight ref={faceFill} target={sunTarget} position={[-8,10,12]} intensity={0} color="#d0d7e2" />
      <directionalLight ref={sun} target={sunTarget} position={[-30, 8, -50]} intensity={1.6} color="#ffd9a8" />
      <hemisphereLight ref={hemi} color="#c8a0b8" groundColor="#6a4a2a" intensity={0.7} />
      <sprite ref={sunSprite} position={[-30, 10, -70]} scale={[36, 36, 1]}>
        <spriteMaterial map={sunTex} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={sunDisc} material={discMaterial} position={[-30,10,-70]}>
        <planeGeometry args={[9,9]} />
      </mesh>
      <Ground sand={sand} contacts={contacts} />
      <WheatField quality={q} sand={sand} cursor={cursor} />
      <Sand count={Math.floor(220 * q)} sand={sand} cursor={cursor} />
      <JourneyParticleField journey={journey} height={(x,z)=>duneWorld(x,z)*sand.value} />
      <PaperStage />
      <FoxDepthOfField focus={focus} interval={[9.12,9.30,10.95,11.15]} />
      <group ref={foxGround}><Fox fs={fs} cursor={cursor} /></group>
      <Wreck />
      <Prince ref={princeG} rig={rig} onStep={()=>{if(world.t>=10.55 && world.t<=11.31)recordFootfall(journey,princeG.current.position.x,world.t)}} />
    </group>
  );
}

