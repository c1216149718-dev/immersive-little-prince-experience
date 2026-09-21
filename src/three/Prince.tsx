import { forwardRef, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { damp, world } from "../state";
import { useModel } from "./ModelAsset";
import { LocalMotion, spring } from "./secondaryMotion";

export interface PrinceRig { walk: number; speed: number; sit: number; lookUp: number; tend: number; phase: number; groundOffset?: number }
export const makeRig = (): PrinceRig => ({ walk: 0, speed: 0, sit: 0, lookUp: 0, tend: 0, phase: 0 });
export const PRINCE_HEIGHT = .72;

export const Prince = forwardRef<THREE.Group, { rig: PrinceRig; onStep?: () => void }>(function Prince({ rig, onStep }, ref) {
  const model = useModel("prince");
  const visual = useRef<THREE.Group>(null!);
  const motion = useMemo(() => new LocalMotion(), []);
  const animation = useMemo(() => {
    const mixer = new THREE.AnimationMixer(model.scene);
    const idle = mixer.clipAction(model.clips.find(c => c.name === "Idle")!);
    const walk = mixer.clipAction(model.clips.find(c => c.name === "Walk")!);
    return { mixer, idle, walk };
  }, [model]);
  const clipPosition = useMemo(() => model.bones.Hips.position.clone(), [model]);
  const clipPose = useMemo(() => Object.values(model.bones).map(bone => ({ bone, rotation: bone.quaternion.clone() })), [model]);
  const soles = useMemo(() => {
    const mesh = model.scene.getObjectByName("prince_visual") as THREE.SkinnedMesh;
    const position = mesh.geometry.attributes.position;
    const candidates: number[] = [];
    for (let i = 0; i < position.count; i++) if (position.getY(i) < .004) candidates.push(i);
    return { mesh, indices: candidates.filter((_, i) => i % Math.max(1, Math.floor(candidates.length / 64)) === 0), point: new THREE.Vector3() };
  }, [model]);
  const state = useRef({ walk: 0, sit: 0, look: 0, tend: 0, ground: 0, lastStep: 0,
    scarf: Array.from({ length: 4 }, () => ({ pitch: {value:0,velocity:0}, side:{value:0,velocity:0} })) });
  useEffect(() => {
    animation.idle.play(); animation.walk.play();
    return () => { animation.mixer.stopAllAction(); };
  }, [animation, model]);
  useFrame((frame, rawDt) => {
    const dt = Math.min(rawDt, .05), c = state.current, b = model.bones;
    c.walk += (rig.walk - c.walk) * damp(8, dt);
    // The chair controller already supplies a smooth transition shared with its root.
    c.sit = rig.sit;
    c.look += (rig.lookUp - c.look) * damp(4, dt);
    c.tend += (rig.tend - c.tend) * damp(4, dt);
    c.ground += ((rig.groundOffset ?? 0)-c.ground)*damp(12,dt);
    visual.current.position.y = c.ground*(1-c.sit);
    const weight = c.walk * (1 - c.sit);
    animation.idle.setEffectiveWeight(1 - weight);
    animation.walk.setEffectiveWeight(weight);
    animation.walk.setEffectiveTimeScale(rig.speed / .36);
    // Restore the last clip-only pose: the mixer skips unchanged bindings.
    for (const p of clipPose) p.bone.quaternion.copy(p.rotation);
    b.Hips.position.copy(clipPosition);
    animation.mixer.update(dt);
    for (const p of clipPose) p.rotation.copy(p.bone.quaternion);
    clipPosition.copy(b.Hips.position);
    rig.phase += rig.speed / .36 * Math.PI * 2 * dt;
    const step = Math.floor(rig.phase / Math.PI);
    if (step !== c.lastStep && weight > .3) onStep?.();
    c.lastStep = step;
    // Pose only visual bones. Surface transforms remain on the parent root.
    b.Spine.rotation.x += c.tend * -.28;
    b.Head.rotation.x += c.look * -.22 + c.tend * .12;
    for (const side of ["L", "R"]) {
      b["Thigh"+side].rotation.x = THREE.MathUtils.lerp(b["Thigh"+side].rotation.x, 1.45, c.sit);
      b["Shin"+side].rotation.x = THREE.MathUtils.lerp(b["Shin"+side].rotation.x, -1.45, c.sit);
      b["Coat"+side].rotation.x = THREE.MathUtils.lerp(b["Coat"+side].rotation.x, 1.30, c.sit);
      
      b["Shoulder"+side].rotation.x += c.sit * .45 - c.tend * .6;
      b["Elbow"+side].rotation.x += c.sit * .65 + c.tend * .35;
    }
    // Keep the stance sole on the ideal navigation sphere without raycast normals.
    model.scene.updateMatrixWorld(true);
    soles.mesh.skeleton.update();
    let floor = Infinity;
    for (const index of soles.indices) {
      soles.mesh.getVertexPosition(index, soles.point);
      floor = Math.min(floor, soles.point.y);
    }
    // The authored stance determines the walk's body motion. Correct only
    // penetration while walking; idle/interaction can settle exactly on the floor.
    if (Number.isFinite(floor)) b.Hips.position.y -= (floor * (1-weight) + Math.min(0, floor) * weight) * (1-c.sit);
    motion.update(visual.current.parent!, dt);
    for (let i = 0; i < 4; i++) {
      const s = c.scarf[i];
      // The supplied scarf rests on the chest: constrain rear travel at the torso.
      const pitch = world.reducedMotion ? 0 : THREE.MathUtils.clamp(-motion.forwardSpeed * .018 - motion.acceleration * .012, -.012, .07) * (1 - c.sit);
      const side = world.reducedMotion ? 0 : (motion.sideSpeed * .045 + motion.turnSpeed * .035) * (1 - c.sit);
      b["Scarf"+i].rotation.x = spring(s.pitch, pitch, dt, .08);
      b["Scarf"+i].rotation.z = spring(s.side, side * (1 + i * .12), dt, .12);
    }
    if (!world.reducedMotion) b.Neck.rotation.x += Math.sin(frame.clock.elapsedTime * 1.7) * .006;
  });
  return <group ref={ref}><group ref={visual} name="PrinceVisualRoot"><primitive object={model.scene} dispose={null} /></group></group>;
});
