import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { B612, R, ROSE_DIR, CHAIR_DIR, VOLCANO_DIRS, PRINCE_START, surfaceRadius, visualGroundOffset, planetFx } from "./Planet";
import { Prince, makeRig } from "./Prince";
import { world, useUI, T, smooth, damp, lerp } from "../state";
import { audio } from "../audio";
import { makeSphereCollision } from "./CollisionProxy";
import fixtures from "./planet-fixtures.json";
import { glowTexture } from "./util";
import { createSunDiscMaterial } from "./sunDisc";

const ROSE_LINES = [
  "She was not the only rose in the universe. She was the only one he had watered.",
  "Near her petals, even the wind learns to be gentle.",
  "“I am fragile,” she said, “which is a way of asking to be looked at.”",
];

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qUp = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const skyColor = new THREE.Color();
const _cA = new THREE.Color(), _cB = new THREE.Color();

function lookQuat(out: THREE.Quaternion, pos: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) {
  _m.lookAt(pos, target, up);
  return out.setFromRotationMatrix(_m);
}

export function B612Scene() {
  const { camera, scene } = useThree();
  useEffect(() => () => { if (scene.background instanceof THREE.Color) scene.background.set("#06070f"); }, [scene]);
  const princeG = useRef<THREE.Group>(null!);
  const planetG = useRef<THREE.Group>(null!);
  const keyLight = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const fill = useRef<THREE.DirectionalLight>(null!);
  const sunSprite = useRef<THREE.Sprite>(null!);
  const sunDisc = useRef<THREE.Mesh>(null!);
  const sunMaterial = useMemo(createSunDiscMaterial, []);
  useEffect(() => () => sunMaterial.dispose(), [sunMaterial]);
  const farStar = useRef<THREE.Sprite>(null!);
  const rig = useMemo(makeRig, []);
  const collision = useMemo(()=>makeSphereCollision(fixtures.blockers,R),[]);

  const st = useRef({
    P: PRINCE_START.clone().normalize().multiplyScalar(R),
    F: new THREE.Vector3(0, 0, -1),
    N: PRINCE_START.clone().normalize(),
    vel: 0,
    keys: new Set<string>(),
    camPos: new THREE.Vector3(0, 1.5, 160),
    camUp: new THREE.Vector3(0, 1, 0),
    camInit: false,
    nearRose: 0,
    nearVolcano: 0,
    nearChair: 0,
    hint: null as string | null,
    sitting: false,
    standing: false,
    sitElapsed: 0,
    seatTime: 0,
    sitFrom: 0,
    approachAngle: 0,
    transitionFrom: new THREE.Vector3(),
    sitQ: new THREE.Quaternion(),
    sunset: 0,
    dayness: 0,
    warm: 0,
    interacted: false,
    moved: false,
    exploreTime: 0,
    lineIndex: 0,
    drag: false,
    lastX: 0,
    sitFwd: new THREE.Vector3(),
    keyDir: new THREE.Vector3(1, 0.9, 0.6).normalize(),
    lookUpTimer: 0,
  });

  // initial tangent forward
  useEffect(() => {
    const s = st.current;
    s.F.set(0, 0, -1).addScaledVector(s.N, -s.F.dot(s.N)).normalize();
    princeG.current.position.copy(s.P);
    _v1.crossVectors(s.F, s.N);
    _m.makeBasis(_v1, s.N, _v2.copy(s.F).negate());
    princeG.current.quaternion.setFromRotationMatrix(_m);
    world.prince.pos.copy(s.P);
  }, []);

  // input
  useEffect(() => {
    const s = st.current;
    const down = (e: KeyboardEvent) => {
      if(e.target instanceof Element && e.target.closest("button,a,input,textarea"))return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "e") {
        if(e.repeat)return;
        if (!world.exploring) return;
        if (s.sitting) standUp();
        else if (s.hint === "sit") sitDown();
        else if (s.hint === "listen") listen();
        else if (s.hint === "tend") tend();
        return;
      }
      if (s.sitting && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) standUp();
      s.keys.add(k);
    };
    const up = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase());
    const pd = (e: PointerEvent) => { s.drag = true; s.lastX = e.clientX; };
    const pu = () => { s.drag = false; };
    const pm = (e: PointerEvent) => {
      if (s.drag && s.sitting) s.sunset = THREE.MathUtils.clamp(s.sunset + (e.clientX - s.lastX) * 0.0012, 0, 1);
      s.lastX = e.clientX;
    };
    const wheel = (e: WheelEvent) => {
      if (s.sitting) s.sunset = THREE.MathUtils.clamp(s.sunset + e.deltaY * 0.00045, 0, 1);
    };
    const blur = () => s.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerdown", pd);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointermove", pm);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ui = () => useUI.getState();

  function listen() {
    const s = st.current;
    s.interacted = true;
    const line = ROSE_LINES[s.lineIndex % ROSE_LINES.length];
    s.lineIndex++;
    ui().set({ roseLine: line, interactHint: null });
    s.hint = null;
    rig.lookUp = 0;
    audio.chime(1);
    window.setTimeout(() => { if (useUI.getState().roseLine === line) useUI.getState().set({ roseLine: null }); }, 7000);
  }
  function tend() {
    const s = st.current;
    s.interacted = true;
    rig.tend = 1;
    ui().set({ interactHint: null });
    s.hint = null;
    window.setTimeout(() => (rig.tend = 0), 2200);
  }
  function sitDown() {
    const s = st.current;
    s.interacted = true;
    s.sitting = true;
    s.sunset = 0.06;
    world.prince.sitting = true;
    rig.sit = 0;
    s.sitElapsed = 0;
    s.seatTime = 0;
    const offset=s.N.clone().addScaledVector(CHAIR_DIR,-s.N.dot(CHAIR_DIR)).normalize();
    s.approachAngle=Math.atan2(offset.dot(chairRight),offset.dot(chairFwd));
    rig.walk = 0;
    rig.speed = 0;
    s.vel = 0;
    ui().set({ sitting: true, interactHint: null });
    s.hint = null;
    audio.chime(0.75);
  }
  function standUp() {
    const s = st.current;
    s.sitting = false;
    if(s.seatTime===0){
      s.standing=false;world.prince.sitting=false;rig.sit=0;
      ui().set({sitting:false});return;
    }
    s.standing = true;
    s.sitElapsed = 0;
    s.sitFrom = rig.sit;
    s.transitionFrom.copy(s.P);
    ui().set({ sitting: false });
  }

  const sunTex = useMemo(() => glowTexture(256, "rgba(255,214,150,1)", "rgba(255,150,80,0)", 1.6), []);
  const starTex = useMemo(() => glowTexture(128, "rgba(255,238,205,1)", "rgba(255,220,160,0)", 1.2), []);

  // Match the fused chair's visual base and seat to the new hip height.
  const chairPos = useMemo(() => new THREE.Vector3().fromArray(fixtures.chair.rootPosition), []);
  const rosePos = useMemo(() => ROSE_DIR.clone().normalize().multiplyScalar(surfaceRadius(ROSE_DIR.clone().normalize())), []);
  const roseN = useMemo(() => ROSE_DIR.clone().normalize(), []);
  const roseSide = useMemo(() => new THREE.Vector3().crossVectors(roseN, WORLD_UP).normalize().negate(), [roseN]);
  const volcanoPos = useMemo(() => VOLCANO_DIRS[0].clone().normalize().multiplyScalar(R + 0.2), []);
  const chairFwd = useMemo(() => new THREE.Vector3().fromArray(fixtures.chair.forward), []);
  const chairRight = useMemo(() => new THREE.Vector3().crossVectors(chairFwd,CHAIR_DIR).normalize(), [chairFwd]);
  const chairEntry = useMemo(() => CHAIR_DIR.clone().multiplyScalar(Math.cos(.40/R)).addScaledVector(chairFwd,Math.sin(.40/R)).multiplyScalar(R), [chairFwd]);

  useFrame((_state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const t = world.t;
    const exploring = world.exploring;
    const rm = world.reducedMotion;
    if (!exploring && s.sitting) standUp();

    /* ---------------- character controller ---------------- */
    let actualSpeed=0;
    if (exploring && !s.sitting && !s.standing) {
      s.exploreTime += dt;
      const k = s.keys;
      const turn = (k.has("a") || k.has("arrowleft") ? 1 : 0) - (k.has("d") || k.has("arrowright") ? 1 : 0);
      const move = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 0.55 : 0);
      if (turn !== 0 || move !== 0) {
        if (!s.moved) {
          s.moved = true;
          ui().set({ wanderHint: false });
        }
      }
      if (turn !== 0) s.F.applyAxisAngle(s.N, turn * 2.2 * dt);
      s.vel += (move * 0.58 - s.vel) * damp(7, dt);
      if (Math.abs(s.vel) > 0.002) {
        const before=s.P.clone().normalize();
        collision.move(s.P,s.F.clone().multiplyScalar(s.vel*dt),s.P);
        actualSpeed=Math.acos(THREE.MathUtils.clamp(before.dot(s.P.clone().normalize()),-1,1))*R/dt*Math.sign(s.vel);
      }
    } else if (s.sitting) {
      s.sitElapsed+=dt;
      const approachDuration=.55+Math.abs(s.approachAngle)*.8;
      const approaching=s.sitElapsed<approachDuration||(s.seatTime===0&&s.P.distanceTo(chairEntry)>.035);
      if(approaching){
        const angle=s.approachAngle*(1-smooth(0,approachDuration,s.sitElapsed));
        const tangent=chairFwd.clone().multiplyScalar(Math.cos(angle)).addScaledVector(chairRight,Math.sin(angle));
        const target=CHAIR_DIR.clone().multiplyScalar(Math.cos(.40/R)).addScaledVector(tangent,Math.sin(.40/R)).multiplyScalar(R);
        const before=s.P.clone();
        const step=target.sub(s.P).multiplyScalar(damp(14,dt)).clampLength(0,.58*dt);
        collision.move(s.P,step,s.P);
        actualSpeed=before.distanceTo(s.P)/dt;
        if(step.lengthSq()>1e-8)s.F.lerp(step.normalize(),damp(10,dt));
        rig.sit=0;
      }else{
        if(s.seatTime===0)s.transitionFrom.copy(s.P);
        s.seatTime+=dt;
        const k=smooth(0,.8,s.seatTime);
        s.P.copy(s.transitionFrom).lerp(chairPos,k);
        rig.sit=k;
      }
      if(!approaching)s.F.lerp(chairFwd,damp(8,dt));
      s.vel=0;
    } else if(s.standing){
      s.sitElapsed+=dt;
      const k=smooth(0,.8,s.sitElapsed);
      s.P.copy(s.transitionFrom).lerp(chairEntry,k);
      rig.sit=s.sitFrom*(1-k);s.vel=0;
      if(k===1){s.standing=false;world.prince.sitting=false;}
    } else {
      s.vel *= 0.9;
    }
    // constrain to the sphere & re-orthogonalize the frame
    s.N.copy(s.P).normalize();
    const r = s.sitting || s.standing ? s.P.length() : surfaceRadius(s.N) - 0.005;
    s.P.copy(s.N).multiplyScalar(r);
    s.F.addScaledVector(s.N, -s.F.dot(s.N));
    if (s.F.lengthSq() < 1e-6) s.F.set(1, 0, 0).addScaledVector(s.N, -s.N.x);
    s.F.normalize();

    // prince transform: right = F × N, up = N, back = -F
    const right = _v1.crossVectors(s.F, s.N).normalize();
    _m.makeBasis(right, s.N, _v2.copy(s.F).negate());
    _q.setFromRotationMatrix(_m);
    princeG.current.quaternion.slerp(_q, damp(12, dt));
    princeG.current.position.copy(s.P);
    rig.walk = Math.min(1, Math.abs(actualSpeed) / 0.12);
    rig.speed = actualSpeed;
    rig.groundOffset = visualGroundOffset(s.N);
    world.prince.pos.copy(s.P);
    world.prince.normal.copy(s.N);
    world.prince.forward.copy(s.F);
    world.prince.moving = Math.abs(actualSpeed) > 0.05;

    /* ---------------- proximity & interaction hints ---------------- */
    const arc = (dir: THREE.Vector3) => Math.acos(THREE.MathUtils.clamp(s.N.dot(_v3.copy(dir).normalize()), -1, 1)) * R;
    const dRose = arc(ROSE_DIR), dChair = arc(CHAIR_DIR), dVol = Math.min(...VOLCANO_DIRS.map(arc));
    s.nearRose += ((dRose < 0.75 ? 1 - dRose / 0.75 : 0) - s.nearRose) * damp(3, dt);
    s.nearVolcano += ((dVol < 0.7 ? 1 - dVol / 0.7 : 0) - s.nearVolcano) * damp(3, dt);
    planetFx.roseNear = s.nearRose;
    planetFx.volcanoNear = s.nearVolcano;

    let hint: string | null = null;
    if (exploring && !s.sitting && !s.standing) {
      if (dChair < 0.42) hint = "sit";
      else if (dRose < 0.55) hint = "listen";
      else if (dVol < 0.78) hint = "tend";
    }
    if (hint !== s.hint) {
      s.hint = hint;
      ui().set({ interactHint: hint });
    }
    rig.lookUp = s.sitting ? 0.35 + s.sunset * 0.2 : hint === "listen" ? 0 : 0;

    // leaving becomes possible after a real visit
    if (exploring && !world.canLeave && s.moved && (s.interacted || s.exploreTime > 28)) {
      world.canLeave = true;
      ui().set({ leaveHint: true });
    }

    /* ---------------- sunset ---------------- */
    const dayTarget = s.sitting ? 1 - smooth(0.55, 1.0, s.sunset) : 0;
    s.dayness += (dayTarget - s.dayness) * damp(1.2, dt);
    const warmT = s.sitting ? smooth(0.05, 0.45, s.sunset) * (1 - smooth(0.6, 0.95, s.sunset)) : 0;
    s.warm += (warmT - s.warm) * damp(1.5, dt);
    world.sunset = s.dayness;
    const el = lerp(0.3, -0.34, s.sunset);
    const sunDir = _v3.copy(chairFwd).multiplyScalar(Math.cos(el)).addScaledVector(CHAIR_DIR.clone().normalize(), Math.sin(el)).normalize();
    const kd = s.keyDir.clone().lerp(sunDir, s.dayness).normalize();
    keyLight.current.position.copy(kd).multiplyScalar(12);
    const lightFade = 1 - smooth(2.97, 3.3, t);
    keyLight.current.intensity = (1.25 + s.dayness * 0.45) * lightFade;
    keyLight.current.color.set("#fff2dc").lerp(new THREE.Color("#ffa86a"), s.warm);
    hemi.current.intensity = (0.55 + s.dayness * 0.25) * lightFade;
    fill.current.intensity = 0.22 * lightFade;
    (hemi.current.color as THREE.Color).set("#2b3160").lerp(new THREE.Color("#7f7fc0"), s.dayness).lerp(new THREE.Color("#e8a070"), s.warm * 0.6);
    sunSprite.current.position.copy(sunDir).multiplyScalar(60);
    const sm = sunSprite.current.material as THREE.SpriteMaterial;
    sm.opacity = s.dayness * 0.22;
    sunDisc.current.position.copy(sunSprite.current.position);
    sunDisc.current.quaternion.copy(camera.quaternion);
    sunMaterial.uniforms.uOpacity.value = s.dayness;
    sm.color.set("#ffe9b8").lerp(new THREE.Color("#ff9955"), s.warm);
    const sc = 12 + s.warm * 4;
    sunSprite.current.scale.set(sc, sc, 1);
    // sky: night → violet-blue → warm orange → deep night, as the planet turns
    skyColor.set("#06070f").lerp(_cA.set("#3b3672").lerp(_cB.set("#e08a4a"), s.warm), s.dayness);
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color("#06070f");
    (scene.background as THREE.Color).copy(skyColor);

    /* ---------------- audio positions ---------------- */
    audio.setSource("rose", rosePos);
    audio.setSource("volcano", volcanoPos);

    /* ---------------- far star (the asteroid seen from the void) ---------------- */
    const fm = farStar.current.material as THREE.SpriteMaterial;
    fm.opacity = smooth(0.28, 0.6, t) * (1 - smooth(1.25, 1.7, t)) * 0.9;
    planetG.current.visible = t > 0.3;

    /* ---------------- camera ---------------- */
    if (t >= 2.95) return; // rose scene owns the camera

    // explore pose
    const mx = rm ? 0 : world.mouse.x, my = rm ? 0 : world.mouse.y;
    const sit = rig.sit;
    const ePos = _v2.copy(s.P).addScaledVector(s.N, 1.3).addScaledVector(s.F, -2.55).addScaledVector(right, 0.32 + mx * 0.3).addScaledVector(s.N, my * 0.2);
    const eTarget = new THREE.Vector3().copy(s.P).addScaledVector(s.N, 0.5).addScaledVector(s.F, 0.7);
    if (sit > 0.001) {
      const sp = new THREE.Vector3().copy(s.P).addScaledVector(s.N, 0.75).addScaledVector(s.F, -3.0).addScaledVector(right, 1.5 + mx * 0.2);
      const stg = new THREE.Vector3().copy(s.P).addScaledVector(s.N, 0.45).addScaledVector(s.F, 1.4);
      ePos.lerp(sp, sit);
      eTarget.lerp(stg, sit);
    }
    const eUp = s.N;

    let desiredPos: THREE.Vector3, desiredTarget: THREE.Vector3, desiredUp: THREE.Vector3;
    let posRate = 4, rotRate = 5;

    if (t < T.APPROACH) {
      // the void: drifting far away, the asteroid a grain of light
      const k = t / T.APPROACH;
      desiredPos = new THREE.Vector3(mx * 0.8, 1.5 + my * 0.5, 160 - k * 30);
      desiredTarget = new THREE.Vector3(mx * 1.4, my * 0.9, 0);
      desiredUp = WORLD_UP;
      posRate = 6;
      rotRate = 6;
    } else if (t < T.EXPLORE + 0.001 && !world.visitedB612 && !world.exploring) {
      // approach: exponential distance falloff so the planet grows the way a real approach feels
      const k = smooth(T.APPROACH, T.EXPLORE, t);
      const a = 3.6;
      const sfrac = (Math.exp(-a * k) - Math.exp(-a)) / (1 - Math.exp(-a));
      const start = new THREE.Vector3(0, 1.5, 130);
      desiredPos = new THREE.Vector3().copy(ePos).add(_v1.copy(start).sub(ePos).multiplyScalar(sfrac));
      // a gentle arc so the world turns under us
      desiredPos.x += Math.sin(k * Math.PI) * 9 * (1 - k * 0.3);
      desiredPos.y += Math.sin(k * Math.PI) * 3;
      desiredTarget = new THREE.Vector3(0, 0, 0).lerp(eTarget, smooth(0.35, 1, k));
      desiredUp = new THREE.Vector3().copy(WORLD_UP).lerp(eUp, smooth(0.5, 1, k)).normalize();
      posRate = 8;
      rotRate = 6;
    } else if (t <= T.EXPLORE + 0.001) {
      desiredPos = ePos.clone();
      desiredTarget = eTarget;
      desiredUp = eUp;
      posRate = s.sitting ? 1.6 : 4.2;
      rotRate = s.sitting ? 1.8 : 5;
    } else {
      // leaving: drift from behind the prince to the glass dome
      const k1 = smooth(T.DOME, T.DOME + 0.6, t);
      const k2 = smooth(T.DOME + 0.6, 2.95, t);
      const a = new THREE.Vector3().copy(rosePos).addScaledVector(roseN, 0.46).addScaledVector(roseSide, 1.25);
      const b = new THREE.Vector3().copy(rosePos).addScaledVector(roseN, 0.36).addScaledVector(roseSide, 0.31);
      const tgA = new THREE.Vector3().copy(rosePos).addScaledVector(roseN, 0.3);
      // orbit around the planet: interpolate direction and radius separately so we never pass through it
      const rA = ePos.length(), rB = a.length();
      const dir = ePos.clone().normalize().lerp(a.clone().normalize(), k1);
      if (dir.lengthSq() < 1e-4) dir.copy(WORLD_UP);
      dir.normalize();
      const orbit = dir.multiplyScalar(lerp(rA, rB, k1) + Math.sin(k1 * Math.PI) * 0.8);
      desiredPos = orbit.lerp(b, k2);
      desiredTarget = eTarget.clone().lerp(tgA, k1);
      desiredUp = new THREE.Vector3().copy(eUp).lerp(roseN, k1).normalize();
      posRate = 6;
      rotRate = 6;
    }

    if (!s.camInit) {
      s.camPos.copy(desiredPos);
      s.camUp.copy(desiredUp);
      camera.position.copy(desiredPos);
      lookQuat(camera.quaternion, desiredPos, desiredTarget, desiredUp);
      s.camInit = true;
    }
    s.camPos.lerp(desiredPos, damp(posRate, dt));
    s.camUp.lerp(desiredUp, damp(rotRate, dt)).normalize();
    camera.position.copy(s.camPos);
    lookQuat(_qUp, s.camPos, desiredTarget, s.camUp);
    camera.quaternion.slerp(_qUp, damp(rotRate, dt));

    // audio listener
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    audio.setListener(camera.position, fwd, upv);
  });

  return (
    <group>
      <group ref={planetG}>
        <B612 />
        <Prince ref={princeG} rig={rig} onStep={() => audio.step()} />
      </group>
      <sprite ref={farStar} position={[0, 0, 0]} scale={[2.6, 2.6, 1]}>
        <spriteMaterial map={starTex} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={sunDisc} material={sunMaterial}><planeGeometry args={[4.5, 4.5]} /></mesh>
      <sprite ref={sunSprite} scale={[14, 14, 1]}>
        <spriteMaterial map={sunTex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <directionalLight ref={keyLight} position={[12, 10, 7]} intensity={1.25} color="#fff2dc" />
      <hemisphereLight ref={hemi} color="#2b3160" groundColor="#1a1410" intensity={0.55} />
      <directionalLight ref={fill} position={[-8, -4, -6]} intensity={0.22} color="#9fb0ff" />
    </group>
  );
}
