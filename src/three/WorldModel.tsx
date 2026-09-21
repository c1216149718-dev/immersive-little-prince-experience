import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { stagePhase,stageX } from "./stageMotion";
import { WorldPropBurst } from "./WorldPropBurst";
import { type StageAssets } from "./StageAssets";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { world, smooth, damp } from "../state";
import models from "./world-models.json";
import { currentWorldIndex, getWorldModel, retainWorldModel, retryWorldModel, setWorldResidency, subscribeWorldModels, worldModelSnapshot } from "./worldModelCache";

export const PLANET_X = [10, 25, 40, 55, 70, 85];
export const PLANET_Y = [1.2, -2.2, 2.4, -1.6, 1.8, -2.4];
export const PLANET_Z = [-7, -8.5, -7.5, -9, -7, -8];
function WorldModel({ index,assets }: { index: number;assets:StageAssets }) {
  useSyncExternalStore(subscribeWorldModels, worldModelSnapshot);
  const entry = getWorldModel(index);
  const model = models[index];
  const [showLoading, setShowLoading] = useState(() => index === currentWorldIndex(world.t) && world.t >= 5 && world.t < 8.15);
  const loadingVisible = useRef(showLoading);
  const parade = useRef<THREE.Group>(null!);
  const shell = useRef<THREE.Group>(null!);
  const light = useRef<THREE.PointLight>(null!),lamp=useRef<THREE.PointLight>(null!);
  const target = useRef(0), hover = useRef(0), clock = useRef(0);
  const replay = useRef(world.replayVersion);
  useEffect(() => retainWorldModel(index), [index, entry]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .05);
    const visible = index === currentWorldIndex(world.t) && world.t >= 5 && world.t < 8.15;
    if (visible !== loadingVisible.current) {
      loadingVisible.current = visible;
      setShowLoading(visible);
    }
    hover.current += (target.current - hover.current) * damp(3, dt);
    if (replay.current !== world.replayVersion) { replay.current = world.replayVersion; clock.current = 0; }
    if (!world.playbackPaused && !world.reducedMotion) clock.current += dt;
    // Keep the authored front facing the fixed theatre camera.
    const p=stagePhase(world.t,index);
    if(lamp.current)lamp.current.intensity=35*smooth(.18,.42,p)*(1-smooth(.75,.95,p));
    parade.current.visible=p>=0&&p<=1;
    parade.current.position.set(stageX(p),-.45,0);
    shell.current.rotation.y=model.yaw+(world.reducedMotion?0:Math.sin(clock.current*.24)*.025);
    const presence = smooth(4.7, 5, world.t) * (1 - smooth(9, 9.3, world.t));
    const cycle = index === 4 ? .65 + .25 * Math.sin(clock.current * .35) : 1;
    light.current.intensity = presence * (.8 * cycle + hover.current * .5);
    if (index === 2) light.current.position.x = 1.2 + Math.sin(clock.current * .25) * .6;
  });
  const scale = model.radius / model.bodyRadius;
  return (
    <group ref={parade} name={`World-${model.id}`} scale={1.32}>
      <WorldPropBurst index={index} assets={assets}/>
      {[-.22,.22].map(x=><mesh castShadow receiveShadow key={x} position={[x,-1.62,-.2]}><cylinderGeometry args={[.035,.04,.93,7]}/><meshStandardMaterial color="#76502d" roughness={.9}/></mesh>)}
      {index===4&&<pointLight ref={lamp} position={[.65,3.0,.65]} intensity={0} distance={7} color="#ffbe60"/>}
      <group ref={shell}>
        <pointLight ref={light} position={[1.2, model.radius + 1.2, 3]} color={model.color} intensity={0} distance={9} decay={2} />
        <mesh position={[0, model.radius * .55, 0]}
          onPointerOver={() => { target.current = 1; }}
          onPointerOut={() => { target.current = 0; }}>
          <sphereGeometry args={[model.radius * 1.65, 16, 12]} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
        {entry?.scene && <group scale={scale}>
          <group position={[-model.center[0], -model.center[1], -model.center[2]]}>
            <primitive object={entry.scene} dispose={null} />
          </group>
        </group>}
      </group>
      {entry?.error && <Html center distanceFactor={12}>
        <div style={{ width: 190, color: "#f1e2c6", background: "#111623e8", padding: 14, textAlign: "center" }}>
          This world could not load.
          <button style={{ display: "block", margin: "10px auto 0", cursor: "pointer" }} onClick={() => retryWorldModel(index)}>Retry</button>
        </div>
      </Html>}
      {!entry?.scene && !entry?.error && showLoading &&
        <Html center style={{ whiteSpace: "nowrap", color: "#d9cfbc", pointerEvents: "none" }}>Entering this world…</Html>}
    </group>
  );
}

function windowFor(t: number) {
  if (t >= 8.40) return [];
  const current = currentWorldIndex(t);
  return [current - 1, current, current + 1].filter(index => index >= 0 && index < models.length);
}
export function WorldModels({assets}:{assets:StageAssets}) {
  const [indices, setIndices] = useState(() => windowFor(world.t));
  const key = useRef(indices.join(","));
  useEffect(() => {
    setWorldResidency(indices);
    return () => setWorldResidency([]);
  }, [indices]);
  useFrame(() => {
    const next = windowFor(world.t), nextKey = next.join(",");
    if (nextKey !== key.current) { key.current = nextKey; setIndices(next); }
  });
  return <>{indices.map(index => <WorldModel key={index} index={index} assets={assets} />)}</>;
}

