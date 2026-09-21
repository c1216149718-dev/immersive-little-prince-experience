import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Starfield } from "./Starfield";
import { B612Scene } from "./B612Scene";
import { RoseScene } from "./RoseScene";
import { WorldsScene } from "./WorldsScene";
import { isWorldFrameReady } from "./worldModelCache";
import { FoxScene } from "./FoxScene";
import { advanceTimeline, world, useUI, T, smooth, CHAPTERS, CursorKind } from "../state";
import { planetFx } from "./Planet";
import { audio } from "../audio";

interface Mounted { b612: boolean; rose: boolean; worlds: boolean; fox: boolean }

function Director({ setMounted }: { setMounted: (m: Mounted) => void }) {
  const last = useRef<Mounted>({ b612: true, rose: false, worlds: false, fox: false });
  const lastChapter = useRef("");
  const lastCursor = useRef<CursorKind>("star");
  const fps = useRef({ acc: 0, n: 0, low: 0 });
  const { setDpr, scene } = useThree();

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    // Keep the warm star covering the view until the incoming Fox assets are ready.
    const awaitingFox = world.t >= 8.98 && world.t < 9 && !scene.getObjectByName("FoxDesertScene");
    const awaitingStage = world.t >= 4.98 && world.t < 5.4 && !scene.getObjectByName("WorldsStage");
    if (isWorldFrameReady(world.t) && !awaitingFox && !awaitingStage) advanceTimeline(dt);
    const t = world.t;
    const ui = useUI.getState();

    // scene residency
    const m: Mounted = { b612: t < 3.4, rose: t > 2.6 && t < 5.4, worlds: t > 4.6 && t < 9.4, fox: t > 8.6 };
    const l = last.current;
    if (m.b612 !== l.b612 || m.rose !== l.rose || m.worlds !== l.worlds || m.fox !== l.fox) {
      last.current = m;
      setMounted(m);
    }

    // chapter marker
    let ch = CHAPTERS[0].key;
    for (const c of CHAPTERS) if (t >= c.t - 0.2) ch = c.key;
    if (ch !== lastChapter.current) {
      lastChapter.current = ch;
      ui.set({ chapter: ch });
    }

    // cursor vocabulary
    let cur: CursorKind = "star";
    if (t > 2.9 && t < T.PETAL + 0.6) cur = "petal";
    else if (t >= T.FOX - 0.1 && t < T.SAND + 0.3) cur = "dot";
    else if (t >= T.SAND + 0.3 && t < T.STARS + 0.3) cur = "wind";
    if (cur !== lastCursor.current) {
      lastCursor.current = cur;
      ui.set({ cursor: cur });
    }

    const faded = t > T.STARS + 0.55;
    if (faded !== ui.uiFaded) ui.set({ uiFaded: faded });

    // audio mix follows the story
    const inB612 = smooth(0.8, 1.6, t) * (1 - smooth(2.2, 2.8, t));
    const inRose = smooth(2.6, 3.0, t) * (1 - smooth(4.3, 4.9, t));
    const inSpace = smooth(4.6, 5.2, t) * (1 - smooth(8.6, 9.0, t));
    const inWheat = smooth(8.8, 9.1, t) * (1 - smooth(10.2, 10.8, t));
    const inDesert = smooth(10.4, 11, t) * (1 - smooth(12.0, 12.6, t));
    const end = smooth(12.0, 12.8, t);
    const voidK = 1 - smooth(0.6, 1.4, t);
    audio.setMix(
      {
        wind: 0.12 * voidK + inB612 * 0.7 * (1 - planetFx.roseNear * 0.7) * (1 - world.sunset * 0.35) + inRose * 0.06 + inWheat * (0.3 + world.foxDist * 0.25) + inDesert * 0.55 + end * 0.12,
        wheat: inWheat * (0.55 + world.foxDist * 0.45) + smooth(10.0, 10.3, t) * (1 - smooth(10.4, 11, t)) * 0.9,
        music: 0.28 * voidK + inB612 * (0.42 - planetFx.roseNear * 0.25 + world.sunset * 0.2) + inRose * 0.62 + inSpace * 0.5 + inWheat * (0.2 + world.foxTrust * 0.45) + inDesert * 0.18 + end * 0.14,
        space: 0.5 * voidK + inSpace * 1 + inRose * 0.25 + inB612 * 0.1 + end * 0.45,
        volcano: inB612,
        rose: inB612 + smooth(2.2, 2.6, t) * (1 - smooth(2.9, 3.1, t)),
      },
      0.55 * voidK + inB612 * 1 + inRose * 1.3 + inSpace * 0.7 + inWheat * (0.6 + world.foxTrust) + inDesert * 0.4 + end * 0.35
    );
    audio.update();

    // adaptive resolution: if we can't hold the frame rate, drop DPR quietly
    const f = fps.current;
    f.acc += dtRaw;
    f.n++;
    if (f.acc > 2) {
      const avg = f.n / f.acc;
      f.acc = 0;
      f.n = 0;
      if (avg < 42 && world.dpr > 1.01) {
        f.low++;
        if (f.low >= 2) {
          world.dpr = Math.max(1, world.dpr - 0.25);
          setDpr(world.dpr);
          f.low = 0;
        }
      } else f.low = 0;
    }
  });
  return null;
}

function PlaybackClock() {
  const paused = useUI(s => s.paused);
  const { clock, setFrameloop, invalidate } = useThree();
  useLayoutEffect(() => {
    // R3F resets elapsedTime when changing modes. Preserve animation phase.
    const elapsed = clock.elapsedTime;
    setFrameloop(paused ? "never" : "always");
    clock.elapsedTime = elapsed;
    if (!paused) invalidate();
  }, [paused, clock, setFrameloop, invalidate]);
  return null;
}

export function Experience() {
  const replayVersion = useUI(s => s.replayVersion);
  const [mounted, setMounted] = useState<Mounted>({ b612: true, rose: false, worlds: false, fox: false });
  const [dpr] = useState(() => world.dpr);

  useEffect(() => {
    // stop any wheel from scrolling the document itself
    const prevent = (e: WheelEvent) => e.preventDefault();
    window.addEventListener("wheel", prevent, { passive: false });
    return () => window.removeEventListener("wheel", prevent);
  }, []);

  return (
    <div className="gl-layer">
      <Canvas
        shadows={mounted.worlds}
        dpr={dpr}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false, stencil: false }}
        camera={{ fov: 42, near: 0.05, far: 700, position: [0, 1.5, 160] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          scene.background = new THREE.Color("#06070f");
        }}
      >
        <PlaybackClock />
        <Suspense fallback={null}>
          <Director setMounted={setMounted} />
          <Starfield />
          {mounted.b612 && <B612Scene key={`B612-${replayVersion}`} />}
          {mounted.rose && <RoseScene key={`Rose-${replayVersion}`} />}
          {mounted.worlds && <Suspense fallback={null}><WorldsScene key={`Worlds-${replayVersion}`} /></Suspense>}
          {mounted.fox && <Suspense fallback={null}><FoxScene key={`Fox-${replayVersion}`} /></Suspense>}
        </Suspense>
      </Canvas>
    </div>
  );
}

