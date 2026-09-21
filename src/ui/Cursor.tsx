import { useEffect, useRef } from "react";
import { world, useUI } from "../state";

const STAR = `<path d="M11 0 L12.6 8.6 L22 11 L12.6 13.4 L11 22 L9.4 13.4 L0 11 L9.4 8.6 Z" fill="#f2c879"/>`;
const PETAL = `<path d="M11 1 C17 4 20 10 16 18 C13 22 8 21 6 17 C3 11 6 4 11 1 Z" fill="#d96a80" fill-opacity="0.9"/><path d="M11 3 C13 8 13 13 11 18" stroke="#f3d1c4" stroke-width="0.8" fill="none" stroke-opacity="0.7"/>`;
const DOT = `<circle cx="11" cy="11" r="3.2" fill="#f4dfb0"/><circle cx="11" cy="11" r="8.5" stroke="#f4dfb0" stroke-opacity="0.35" stroke-width="0.8" fill="none"/>`;
const WIND = `<path d="M2 12 C6 9 10 15 14 11 C17 8 19 10 21 9" stroke="#e9d7ae" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-opacity="0.85"/><path d="M4 16 C7 14 10 18 14 15" stroke="#e9d7ae" stroke-width="0.9" fill="none" stroke-linecap="round" stroke-opacity="0.5"/>`;

export function Cursor() {
  const el = useRef<HTMLDivElement>(null!);
  const canvas = useRef<HTMLCanvasElement>(null!);
  const kind = useUI((s) => s.cursor);

  useEffect(() => {
    const svg = el.current.querySelector("svg")!;
    const body = kind === "petal" ? PETAL : kind === "dot" ? DOT : kind === "wind" ? WIND : STAR;
    svg.style.opacity = "0";
    const id = window.setTimeout(() => {
      svg.innerHTML = body;
      svg.style.opacity = "1";
    }, 260);
    return () => window.clearTimeout(id);
  }, [kind]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c.getContext("2d")!;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const pos = { x: -100, y: -100, sx: -100, sy: -100, lastX: -100, lastY: -100, lastT: performance.now(), rot: 0 };
    const trail: { x: number; y: number; t: number; s: number }[] = [];
    let raf = 0;
    let lastFrame = performance.now();
    let idle = 0;

    const move = (e: PointerEvent) => {
      const now = performance.now();
      const dx = e.clientX - pos.lastX, dy = e.clientY - pos.lastY;
      const dt = Math.max(1, now - pos.lastT) / 1000;
      const inst = Math.hypot(dx, dy) / dt;
      world.mouseSpeed = world.mouseSpeed * 0.6 + inst * 0.4;
      pos.lastX = e.clientX;
      pos.lastY = e.clientY;
      pos.lastT = now;
      pos.x = e.clientX;
      pos.y = e.clientY;
      idle = 0;
      world.mouseActive = true;
      world.mousePx.set(e.clientX, e.clientY);
      world.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (!world.reducedMotion && useUI.getState().cursor !== "none" && Math.hypot(dx, dy) > 2) {
        trail.push({ x: e.clientX, y: e.clientY, t: now, s: 0.6 + Math.random() * 1.2 });
        if (trail.length > 40) trail.shift();
      }
    };
    const leave = () => { el.current.style.opacity = "0"; };
    const enter = () => { el.current.style.opacity = "1"; };
    window.addEventListener("pointermove", move);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", enter);

    const frame = () => {
      const now = performance.now();
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      idle += dt;
      if (idle > 0.12) world.mouseSpeed *= Math.max(0, 1 - dt * 12);
      // smooth cursor with a whisper of lag
      pos.sx += (pos.x - pos.sx) * Math.min(1, dt * 26);
      pos.sy += (pos.y - pos.sy) * Math.min(1, dt * 26);
      pos.rot += dt * 18;
      const k = useUI.getState().cursor;
      const rot = k === "star" ? pos.rot : k === "petal" ? Math.sin(now * 0.0012) * 12 - 20 : 0;
      el.current.style.transform = `translate3d(${pos.sx}px, ${pos.sy}px, 0) rotate(${rot}deg)`;

      // trail: 300–500ms of soft dust
      ctx.clearRect(0, 0, c.width, c.height);
      const petal = k === "petal";
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        const age = (now - p.t) / 420;
        if (age >= 1) { trail.splice(i, 1); continue; }
        const a = (1 - age) * (1 - age) * 0.55;
        ctx.beginPath();
        ctx.fillStyle = petal ? `rgba(228,140,160,${a})` : k === "dot" || k === "wind" ? `rgba(240,222,180,${a * 0.6})` : `rgba(242,200,121,${a})`;
        ctx.arc(p.x, p.y + age * 4, p.s * (1 - age * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", enter);
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="trail-canvas" />
      <div ref={el} className="cursor" style={{ opacity: kind === "none" ? 0 : 1 }}>
        <svg viewBox="0 0 22 22" dangerouslySetInnerHTML={{ __html: STAR }} />
      </div>
    </>
  );
}
