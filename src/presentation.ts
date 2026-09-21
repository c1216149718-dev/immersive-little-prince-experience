import { narrativeRate } from "./narrative";

// Chapter/interaction boundaries only. Captions never stop the story clock.
// Desert, camera tilt and Stars form one continuous final sequence.
export const BEATS = [2, 4.10, 9.30, 9.70, 13];
export class Presentation {
  index = 0;
  playing = true;
  paused = false;
  lastInput = -Infinity;
  settledAt = -Infinity;
  start = 0;
  reset(t = 0) {
    this.index = Math.max(0, BEATS.findIndex(end => end > t + .001));
    if (t >= 13) this.index = BEATS.length - 1;
    this.start = t;
    this.playing = t < 13;
    this.paused = false;
    this.lastInput = -Infinity;
    this.settledAt = performance.now();
  }
  advance(t: number, dt: number, now: number, _reduced = false) {
    if (!this.playing || this.paused) return t;
    const end = BEATS[this.index];
    const next = Math.min(end, t + Math.min(dt, .05) * narrativeRate(t));
    if (next >= end) { this.playing = false; this.settledAt = now; }
    return next;
  }
  next(t: number, now: number, explicit = false) {
    const fresh = now - this.lastInput > 300;
    this.lastInput = now;
    if (this.playing || this.paused || this.index >= BEATS.length - 1) return false;
    if (!explicit && (!fresh || now - this.settledAt < 700)) return false;
    this.start = t;
    this.index++;
    this.playing = true;
    return true;
  }
  // Explicit skip finishes the current chapter; ordinary scrolling cannot interrupt it.
  finish(now: number) { this.playing = false; this.paused = false; this.settledAt = now; return BEATS[this.index]; }
}

