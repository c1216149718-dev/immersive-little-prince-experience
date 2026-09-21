import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { world, T, range, smooth, damp } from "../state";
import { starSpriteTexture, glowTexture, hash } from "./util";

export const starReveal = { v: 0 };

const vert = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aSeed;
attribute float aWarm;
uniform float uTime, uReveal, uAttract, uPixelRatio, uOpacity;
uniform vec2 uMouse;
varying float vAlpha;
varying float vWarm;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 d = uMouse - ndc;
  float dist = length(d);
  float pull = uAttract * smoothstep(0.6, 0.0, dist) * 0.16;
  ndc += d * pull;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  float tw = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed * 1.3) + aPhase);
  float reveal = smoothstep(aSeed - 0.04, aSeed + 0.02, uReveal);
  vAlpha = tw * reveal * uOpacity * (1.0 + pull * 14.0);
  vWarm = aWarm;
  gl_PointSize = aSize * uPixelRatio * (1.0 + pull * 5.0);
}`;
const frag = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying float vWarm;
void main(){
  vec4 s = texture2D(uMap, gl_PointCoord);
  vec3 warm = vec3(1.0, 0.86, 0.62);
  vec3 cool = vec3(0.86, 0.9, 1.0);
  vec3 col = mix(cool, warm, vWarm);
  gl_FragColor = vec4(col * s.rgb, s.a * vAlpha);
}`;

function makeLayer(count: number, rMin: number, rMax: number, sizeMin: number, sizeMax: number, seed: number) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const rnd = new Float32Array(count);
  const warm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = hash(i * 12.9898 + seed), v = hash(i * 78.233 + seed * 3.1);
    const theta = u * Math.PI * 2, phi = Math.acos(2 * v - 1);
    const r = rMin + hash(i * 3.7 + seed) * (rMax - rMin);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const s = hash(i * 1.3 + seed * 7);
    size[i] = sizeMin + Math.pow(s, 3) * (sizeMax - sizeMin);
    phase[i] = hash(i * 5.1 + seed) * Math.PI * 2;
    rnd[i] = hash(i * 9.7 + seed * 2);
    warm[i] = hash(i * 2.3 + seed) > 0.35 ? 1 : 0.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(rnd, 1));
  g.setAttribute("aWarm", new THREE.BufferAttribute(warm, 1));
  return g;
}

export function Starfield() {
  const group = useRef<THREE.Group>(null!);
  const near = useRef<THREE.Group>(null!);
  const mid = useRef<THREE.Group>(null!);
  const far = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  const q = world.quality;

  const layers = useMemo(() => {
    const rm = world.reducedMotion ? 0.55 : 1;
    return {
      near: makeLayer(Math.floor(220 * q * rm), 120, 170, 3.5, 9, 1),
      mid: makeLayer(Math.floor(700 * q * rm), 200, 300, 1.8, 4.5, 2),
      far: makeLayer(Math.floor(1600 * q * rm), 340, 440, 1.0, 2.6, 3),
    };
  }, [q]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uAttract: { value: 0 },
      uPixelRatio: { value: world.dpr },
      uOpacity: { value: 1 },
      uMouse: { value: new THREE.Vector2() },
      uMap: { value: starSpriteTexture(64) },
    }),
    []
  );
  const mats = useMemo(
    () =>
      [0, 1, 2].map(
        () =>
          new THREE.ShaderMaterial({
            uniforms: { ...uniforms, uOpacity: { value: 1 } },
            vertexShader: vert,
            fragmentShader: frag,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
          })
      ),
    [uniforms]
  );

  const nebulaTex = useMemo(() => glowTexture(256, "rgba(120,110,200,1)", "rgba(60,50,120,0)", 1.4), []);
  const nebulaTex2 = useMemo(() => glowTexture(256, "rgba(200,120,140,1)", "rgba(90,40,70,0)", 1.2), []);
  const nebulaTex3 = useMemo(() => glowTexture(256, "rgba(230,190,140,1)", "rgba(120,80,40,0)", 1.0), []);

  const smoothed = useRef({ x: 0, y: 0, attract: 0 });

  useFrame((state, dt) => {
    const t = world.t;
    group.current.visible=t<10.55;
    group.current.position.copy(camera.position);
    const s = smoothed.current;
    const pf = world.reducedMotion ? 0.25 : 1;
    s.x += (world.mouse.x - s.x) * damp(2.5, dt);
    s.y += (world.mouse.y - s.y) * damp(2.5, dt);
    near.current.rotation.y = -s.x * 0.06 * pf;
    near.current.rotation.x = s.y * 0.04 * pf;
    mid.current.rotation.y = -s.x * 0.022 * pf;
    mid.current.rotation.x = s.y * 0.015 * pf;
    far.current.rotation.y = -s.x * 0.005 * pf + state.clock.elapsedTime * 0.0015;
    far.current.rotation.x = s.y * 0.004 * pf;

    // ending: stars answer the cursor
    const target = t > T.STARS ? smooth(T.STARS, T.STARS + 0.6, t) : 0;
    s.attract += (target - s.attract) * damp(1.5, dt);

    // overall opacity by chapter: dim inside rose / wheat / bright veil
    let op = 1;
    op *= 1 - 0.9 * smooth(T.ROSE - 0.2, T.ROSE + 0.1, t) * (1 - smooth(T.PETAL + 0.3, T.PETAL + 0.8, t));
    op *= 1 - 0.97 * smooth(T.FOX - 0.35, T.FOX - 0.1, t) * (1 - smooth(T.SAND + 0.2, T.SAND + 0.9, t));
    // B612 exploration: starry sky but slightly softer
    op *= 1 - 0.25 * smooth(T.APPROACH + 0.6, T.EXPLORE, t) * (1 - smooth(T.DOME + 0.3, T.DOME + 0.7, t));
    op *= 1 - world.sunset * 0.94;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uReveal.value = starReveal.v;
    uniforms.uAttract.value = s.attract * (world.reducedMotion ? 0.3 : 1);
    uniforms.uMouse.value.copy(world.mouse);
    mats[0].uniforms.uOpacity.value = op;
    mats[1].uniforms.uOpacity.value = op;
    mats[2].uniforms.uOpacity.value = op * (0.5 + 0.5 * range(t, 0, 0.6));
  });

  return (
    <group ref={group} renderOrder={-10}>
      <group ref={far}>
        <points geometry={layers.far} material={mats[2]} frustumCulled={false} />
        <sprite position={[-180, 90, -300]} scale={[420, 300, 1]}>
          <spriteMaterial map={nebulaTex} transparent opacity={0.10} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite position={[260, -60, -260]} scale={[380, 260, 1]}>
          <spriteMaterial map={nebulaTex2} transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite position={[40, 240, 200]} scale={[300, 220, 1]}>
          <spriteMaterial map={nebulaTex3} transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      <group ref={mid}>
        <points geometry={layers.mid} material={mats[1]} frustumCulled={false} />
      </group>
      <group ref={near}>
        <points geometry={layers.near} material={mats[0]} frustumCulled={false} />
      </group>
    </group>
  );
}

