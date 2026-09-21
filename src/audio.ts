import * as THREE from "three";

/* ---------------------------------------------------------------
   A tiny procedural sound engine. Everything is synthesized with
   the Web Audio API so the experience never depends on remote files.
   ---------------------------------------------------------------- */

export interface Mix {
  wind: number; // low broad wind
  wheat: number; // higher rustle
  music: number; // music box + pad
  space: number; // very low hum
  volcano: number; // positional
  rose: number; // positional
}

function noiseBuffer(ctx: AudioContext, seconds = 4, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

class Engine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  enabled = false;
  muted = false;
  private gains: Partial<Record<keyof Mix, GainNode>> = {};
  private panners: Partial<Record<"volcano" | "rose", PannerNode>> = {};
  private musicBus!: GainNode;
  private delay!: DelayNode;
  private nextNote = 0;
  private density = 1;
  private target: Mix = { wind: 0, wheat: 0, music: 0, space: 0, volcano: 0, rose: 0 };
  private lastStep = 0;

  /** Must be called from a user gesture */
  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.enabled = true;

    const white = noiseBuffer(ctx, 3, false);
    const brown = noiseBuffer(ctx, 5, true);

    const layer = (key: keyof Mix, buf: AudioBuffer, build: (src: AudioBufferSourceNode) => AudioNode) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const out = build(src);
      const g = ctx.createGain();
      g.gain.value = 0;
      out.connect(g);
      g.connect(this.master);
      src.start();
      this.gains[key] = g;
      return g;
    };

    // Wind: brown noise through a slowly wandering low-pass
    layer("wind", brown, (src) => {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      lp.Q.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 220;
      lfo.connect(lfoG);
      lfoG.connect(lp.frequency);
      lfo.start();
      src.connect(lp);
      return lp;
    });

    // Wheat: white noise band-passed and amplitude-modulated (rustle)
    layer("wheat", white, (src) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 0.8;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.35;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.35;
      lfo.connect(lfoG);
      lfoG.connect(am.gain);
      lfo.start();
      src.connect(bp);
      bp.connect(am);
      return am;
    });

    // Space: very low hum (two detuned sines)
    {
      const g = ctx.createGain();
      g.gain.value = 0;
      [55, 55.6, 82.4].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.25 : 0.5;
        o.connect(og);
        og.connect(g);
        o.start();
      });
      g.connect(this.master);
      this.gains.space = g;
    }

    // Music bus with a soft echo
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.62;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 1800;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.delay);
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    dlp.connect(this.master);
    this.gains.music = this.musicBus;

    // Pad under the music
    {
      const padG = ctx.createGain();
      padG.gain.value = 0.045;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 520;
      [146.83, 220.0, 293.66, 369.99].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i % 2 ? "triangle" : "sine";
        o.frequency.value = f;
        o.detune.value = (i - 1.5) * 4;
        o.connect(lp);
        o.start();
      });
      lp.connect(padG);
      padG.connect(this.musicBus);
    }

    // Positional sources
    const positional = (key: "volcano" | "rose", build: () => AudioNode, refDist: number) => {
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "exponential";
      p.refDistance = refDist;
      p.rolloffFactor = 1.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      build().connect(p);
      p.connect(g);
      g.connect(this.master);
      this.gains[key] = g;
      this.panners[key] = p;
    };
    positional(
      "volcano",
      () => {
        const src = ctx.createBufferSource();
        src.buffer = white;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 900;
        bp.Q.value = 1.2;
        const am = ctx.createGain();
        am.gain.value = 0.4;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 3.1;
        const lg = ctx.createGain();
        lg.gain.value = 0.3;
        lfo.connect(lg);
        lg.connect(am.gain);
        lfo.start();
        src.connect(bp);
        bp.connect(am);
        src.start();
        return am;
      },
      1.2
    );
    positional(
      "rose",
      () => {
        const src = ctx.createBufferSource();
        src.buffer = white;
        src.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = "bandpass";
        hp.frequency.value = 5200;
        hp.Q.value = 2.5;
        const am = ctx.createGain();
        am.gain.value = 0.25;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.5;
        const lg = ctx.createGain();
        lg.gain.value = 0.2;
        lfo.connect(lg);
        lg.connect(am.gain);
        lfo.start();
        src.connect(hp);
        hp.connect(am);
        src.start();
        return am;
      },
      1.0
    );

    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    this.nextNote = ctx.currentTime + 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.4);
  }

  setMix(mix: Partial<Mix>, density = 1) {
    Object.assign(this.target, mix);
    this.density = density;
  }

  /** call every frame */
  update() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const scale: Record<keyof Mix, number> = { wind: 0.55, wheat: 0.28, music: 0.9, space: 0.12, volcano: 0.6, rose: 0.5 };
    (Object.keys(this.target) as (keyof Mix)[]).forEach((k) => {
      const g = this.gains[k];
      if (g) g.gain.setTargetAtTime(this.target[k] * scale[k], now, 0.6);
    });
    // music box notes
    if (this.target.music > 0.02 && now >= this.nextNote) {
      this.note();
      const base = 1.6 / Math.max(0.2, this.density);
      this.nextNote = now + base + Math.random() * base * 1.4;
    }
  }

  private note() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.5];
    const f = scale[Math.floor(Math.random() * scale.length)];
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.8);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 3);
    o2.stop(t + 3);
  }

  /** soft footstep on grass */
  step() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastStep < 0.22) return;
    this.lastStep = now;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.12, false);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600 + Math.random() * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
  }

  /** a tiny chime for story moments */
  chime(pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [880, 1318.5, 1760].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * pitch;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.09 + 2.2);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 2.3);
    });
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.05);
      l.positionY.setTargetAtTime(pos.y, t, 0.05);
      l.positionZ.setTargetAtTime(pos.z, t, 0.05);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.05);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.05);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      l.upX.setTargetAtTime(up.x, t, 0.05);
      l.upY.setTargetAtTime(up.y, t, 0.05);
      l.upZ.setTargetAtTime(up.z, t, 0.05);
    } else {
      (l as any).setPosition(pos.x, pos.y, pos.z);
      (l as any).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  setSource(key: "volcano" | "rose", pos: THREE.Vector3) {
    const p = this.panners[key];
    if (!p || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(pos.x, t, 0.05);
      p.positionY.setTargetAtTime(pos.y, t, 0.05);
      p.positionZ.setTargetAtTime(pos.z, t, 0.05);
    } else (p as any).setPosition(pos.x, pos.y, pos.z);
  }
}

export const audio = new Engine();
