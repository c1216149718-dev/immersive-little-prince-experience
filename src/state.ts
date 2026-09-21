import { create } from "zustand";
import * as THREE from "three";
import { Presentation } from "./presentation";
export const presentation = new Presentation();

/* ---------------------------------------------------------------
   Timeline. One continuous scalar `t` drives the whole journey.
   ---------------------------------------------------------------- */
export const T = {
  VOID: 0,
  APPROACH: 1,
  EXPLORE: 2, // scroll locks here until the prince leaves B612
  DOME: 2,
  ROSE: 3,
  PETAL: 4,
  WORLDS: 5,
  GOLDEN: 8,
  FOX: 9,
  SAND: 10,
  DESERT: 11,
  STARS: 12,
  END: 13,
} as const;

export const CHAPTERS: { key: string; label: string; t: number }[] = [
  { key: "b612", label: "B612", t: 1.15 },
  { key: "rose", label: "Rose", t: 3.15 },
  { key: "worlds", label: "Worlds", t: 5.2 },
  { key: "fox", label: "Fox", t: 9.05 },
  { key: "desert", label: "Desert", t: 11.05 },
  { key: "stars", label: "Stars", t: 12.6 },
];

export type CursorKind = "star" | "petal" | "dot" | "wind" | "none";

/* Per-frame mutable data. Never put this in React state. */
export const world = {
  playbackPaused: false,
  windowPaused: false,
  replayVersion: 0,
  t: 0,
  targetT: 0,
  mouse: new THREE.Vector2(0, 0), // NDC -1..1
  mousePx: new THREE.Vector2(-100, -100),
  mouseSpeed: 0, // px / s (smoothed)
  mouseActive: false,
  exploring: false,
  canLeave: false,
  visitedB612: false,
  reducedMotion: false,
  prince: {
    pos: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, -1),
    moving: false,
    sitting: false,
    exitQuat: new THREE.Quaternion(),
    exitPos: new THREE.Vector3(),
  },
  camera: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
  sunset: 0, // 0..1 progress in the chair scene
  foxTrust: 0, // 0..1
  foxDist: 1, // 0 = close, 1 = far
  dpr: 1.5,
  quality: 1, // 0.5..1
};

interface UIState {
  loaded: boolean;
  entered: boolean;
  audioOn: boolean;
  exploring: boolean;
  chapter: string;
  interactHint: string | null; // e.g. "listen" | "sit" | "tend"
  wanderHint: boolean;
  leaveHint: boolean;
  roseLine: string | null;
  foxLine: string | null;
  sitting: boolean;
  cursor: CursorKind;
  uiFaded: boolean;
  reading: boolean;
  playing: boolean;
  paused: boolean;
  beat: number;
  replayVersion: number;
  set: (p: Partial<UIState>) => void;
}

export const useUI = create<UIState>((set) => ({
  loaded: false,
  entered: false,
  audioOn: false,
  exploring: false,
  chapter: "b612",
  interactHint: null,
  wanderHint: false,
  leaveHint: false,
  roseLine: null,
  foxLine: null,
  sitting: false,
  cursor: "star",
  uiFaded: false,
  reading: false,
  playing: true,
  paused: false,
  beat: 0,
  replayVersion: 0,
  set: (p) => set(p),
}));

/* ---------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------- */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** exponential damping factor for frame-rate independent lerps */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** 0..1 progress of t inside a chapter range */
export const range = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

let explorationSeconds = 0;

function syncPresentation() {
  world.playbackPaused = presentation.paused || world.windowPaused;
  useUI.getState().set({ playing: presentation.playing, paused: world.playbackPaused, beat: presentation.index, replayVersion: world.replayVersion, reading: !presentation.playing && !world.exploring });
}

export function setWindowPaused(paused: boolean) {
  world.windowPaused = paused;
  syncPresentation();
}

export function scrollTimeline(delta: number, explicit = false) {
  if (delta <= 0 || world.exploring) return;
  presentation.next(world.t, performance.now(), explicit);
  syncPresentation();
}
export function continueReading() { scrollTimeline(1, true); }
export function pausePresentation() { presentation.paused = !presentation.paused; syncPresentation(); }
export function skipPresentation() {
  const t = presentation.finish(performance.now());
  world.t = world.targetT = t;
  if (t === T.EXPLORE && !world.visitedB612) {
    world.exploring = true;
    useUI.getState().set({ exploring: true, wanderHint: true });
  }
  syncPresentation();
}
export function replayPresentation() {
  const start = presentation.start;
  const replayLeaving = start === T.EXPLORE && !world.exploring;
  jumpTo(start);
  if (replayLeaving) {
    world.exploring = false;
    world.visitedB612 = true;
    presentation.reset(start);
    useUI.getState().set({ exploring: false, wanderHint: false, leaveHint: false });
    syncPresentation();
  }
}
export function leaveExploration() {
  if (world.prince.sitting) return;
  explorationSeconds = 0;
  world.exploring = false;
  world.visitedB612 = true;
  useUI.getState().set({ exploring: false, leaveHint: false, wanderHint: false, interactHint: null, roseLine: null });
  presentation.reset(T.EXPLORE);
  syncPresentation();
}

export function jumpTo(t: number) {
  explorationSeconds = 0;
  presentation.reset(t);
  world.replayVersion++;
  world.foxTrust = 0;
  world.foxDist = 1;
  world.prince.sitting = false;
  world.canLeave = false;
  if(t < T.EXPLORE)world.visitedB612 = false;
  useUI.getState().set({reading:false, sitting:false, roseLine:null, foxLine:null});
  syncPresentation();
  const ui = useUI.getState();
  if (t >= T.EXPLORE && t < T.EXPLORE + 0.01) {
    world.exploring = true;
    world.t = T.EXPLORE;
    world.targetT = T.EXPLORE;
    presentation.playing = false;
    syncPresentation();
    ui.set({ exploring: true, wanderHint: true });
    return;
  }
  if (t > T.EXPLORE) world.visitedB612 = true;
  if (world.exploring) {
    world.exploring = false;
    ui.set({ exploring: false, wanderHint: false, leaveHint: false, interactHint: null });
  }
  world.t = t;
  world.targetT = t;
}

export function restart() {
  explorationSeconds = 0;
  presentation.reset();
  world.replayVersion++;
  world.playbackPaused = world.windowPaused;
  world.t = 0;
  world.targetT = 0;
  world.exploring = false;
  world.canLeave = false;
  world.visitedB612 = false;
  world.sunset = 0;
  world.foxTrust = 0;
  world.foxDist = 1;
  world.prince.sitting = false;
  useUI.getState().set({
    exploring: false,
    interactHint: null,
    wanderHint: false,
    leaveHint: false,
    roseLine: null,
    foxLine: null,
    sitting: false,
    uiFaded: false,
    reading: false,
    playing: true, paused: world.windowPaused, beat: 0, replayVersion: world.replayVersion,
    cursor: "star",
  });
}

/** The render clock stays alive during reading; story time advances only during a beat. */
export function advanceTimeline(dt: number) {
  if (!useUI.getState().entered || document.hidden || world.playbackPaused) return;
  if (world.exploring) {
    explorationSeconds += dt;
    if (!world.canLeave && explorationSeconds >= 5) {
      world.canLeave = true;
      useUI.getState().set({ leaveHint: true, wanderHint: false });
    }
    return;
  }
  explorationSeconds = 0;
  world.t = presentation.advance(world.t, dt, performance.now(), world.reducedMotion);
  world.targetT = world.t;
  if (!world.visitedB612 && world.t === T.EXPLORE) {
    world.exploring = true;
    useUI.getState().set({ exploring: true, wanderHint: true });
  }
  const ui = useUI.getState();
  if (ui.playing !== presentation.playing || ui.beat !== presentation.index || ui.paused !== (presentation.paused || world.windowPaused)) syncPresentation();
}
