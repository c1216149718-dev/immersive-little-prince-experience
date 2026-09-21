import { useEffect, useMemo, useRef, useState } from "react";
import { world, useUI, smooth, clamp01 } from "../state";

import { LINES, lineTiming, type Line, type Style } from "../narrative";

function renderText(text: string, style: Style) {
  const parts = text.split("*");
  if (style === "ink") {
    return parts.map((p, i) => (i % 2 ? <span key={i} className="underline">{p}</span> : <span key={i}>{p}</span>));
  }
  // drift: each letter its own span
  let idx = 0;
  return parts.map((p, i) => {
    const letters = Array.from(p).map((ch) => <span key={idx} data-i={idx++}>{ch === " " ? "\u00a0" : ch}</span>);
    return i % 2 ? <span key={i} className="underline">{letters}</span> : <span key={i}>{letters}</span>;
  });
}

function NarrativeLine({ line }: { line: Line }) {
  const ref = useRef<HTMLDivElement>(null!);
  const total = useMemo(() => Array.from(line.text.replace(/\*/g, "")).length, [line.text]);
  useEffect(() => {
    const el = ref.current;
    const letters = line.style === "drift" ? Array.from(el.querySelectorAll<HTMLSpanElement>("span[data-i]")) : [];
    let raf = 0;
    let wasVisible = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = world.t;
      const timing = lineTiming(line);
      const o = smooth(line.a, timing.revealEnd, t) * (1 - smooth(timing.fadeOutStart, line.b, t));
      const visible = o > 0.002;
      if (!visible && !wasVisible) return;
      wasVisible = visible;
      el.style.opacity = o.toFixed(3);
      const p = smooth(line.a, world.reducedMotion ? line.a+(timing.revealEnd-line.a)*.5 : timing.revealEnd, t);
      el.style.setProperty("--ul", p.toFixed(3));
      if (line.style === "ink") {
        el.style.setProperty("--ink-pos", `${(100 - p * 100).toFixed(2)}%`);
        const drift = world.reducedMotion ? 0 : (1 - p) * 10;
        el.style.transform = `translate(${line.center ? "-50%" : "0"}, ${drift}px)`;
      } else {
        letters.forEach((s, i) => {
          const li = clamp01((p - (i / total) * 0.55) / 0.45);
          s.style.setProperty("--dy", `${((1 - li) * 9).toFixed(2)}px`);
          s.style.setProperty("--lo", li.toFixed(3));
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line, total]);

  return (
    <div ref={ref} data-centered={!!line.center} className="line" style={{ left: line.x, top: line.y, textAlign: line.center ? "center" : "left", transform: line.center ? "translateX(-50%)" : undefined }}>
      <p className={`serif ${line.style}`} style={{ fontSize: line.size || (line.center ? "1.9rem" : "1.55rem"), fontStyle: line.style === "drift" && !line.hand ? "italic" : "normal" }}>
        {renderText(line.text, line.style)}
      </p>
      {line.hand && (
        <p className="hand" style={{ fontSize: "0.95rem", marginTop: "0.9rem", opacity: 0.85 }}>
          {line.hand}
        </p>
      )}
    </div>
  );
}

/* a sentence that floats up out of the world and dissolves like ink */
function FloatingLine({ text, x, y, tone }: { text: string | null; x: string; y: string; tone: "rose" | "fox" }) {
  const [shown, setShown] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (text) {
      setShown(text);
      setGone(false);
    } else if (shown) {
      setGone(true);
      const id = window.setTimeout(() => setShown(null), 1800);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!shown) return null;
  return (
    <div
      key={shown}
      className="line"
      style={{
        left: x,
        top: y,
        maxWidth: "30rem",
        opacity: gone ? 0 : 1,
        filter: gone ? "blur(6px)" : "blur(0px)",
        transform: gone ? "translateY(-26px)" : "translateY(0)",
        transition: gone ? "opacity 1.7s ease, filter 1.7s ease, transform 1.9s ease" : "opacity 1.4s ease 0.2s, transform 1.6s ease",
        animation: "floatIn 1.6s ease both",
      }}
    >
      <p className="serif" style={{ fontSize: "1.35rem", fontStyle: "italic", color: tone === "rose" ? "#f2c9cf" : "#f3e0b6" }}>
        {shown}
      </p>
    </div>
  );
}

export function Narrative() {
  const roseLine = useUI((s) => s.roseLine);
  const foxLine = useUI((s) => s.foxLine);
  const wander = useUI((s) => s.wanderHint);
  const interact = useUI((s) => s.interactHint);
  const leave = useUI((s) => s.leaveHint);
  const sitting = useUI((s) => s.sitting);
  const exploring = useUI((s) => s.exploring);


  return (
    <div className="ui-layer">
      <style>{`@keyframes floatIn { from { opacity: 0; transform: translateY(14px); filter: blur(4px);} to { opacity: 1; transform: translateY(0); filter: blur(0);} }`}</style>
      {LINES.map((l, i) => (
        <NarrativeLine key={i} line={l} />
      ))}
      <FloatingLine text={roseLine} x="54%" y="34%" tone="rose" />
      <FloatingLine text={foxLine} x="12%" y="68%" tone="fox" />


      {/* exploration hints */}
      <div className={`hint ${wander && exploring && !sitting ? "on" : ""}`}>
        <div className="keys">
          <span className="key">W</span>
          <span className="key">A</span>
          <span className="key">S</span>
          <span className="key">D</span>
        </div>
        wander around B612
      </div>
      <div className={`interact ${interact && exploring && !sitting ? "on" : ""}`}>
        <div>
          <span className="key">E</span>
        </div>
        {interact}
      </div>
      <div className={`hint ${sitting ? "on" : ""}`} style={{ bottom: "6vh" }}>
        drag, or scroll — turn the planet toward the sunset
        <div style={{ marginTop: "0.5rem", opacity: 0.6 }}>
          <span className="key">E</span> stand up
        </div>
      </div>
      <div className={`hint ${leave && exploring && !sitting && !wander ? "on" : ""}`} style={{ bottom: "4.5vh", opacity: undefined }}>
        <div style={{ fontSize: "1rem", marginBottom: "0.3rem", color: "var(--gold)", letterSpacing: 0 }}>↓</div>
        scroll — when you are ready to leave B612
      </div>
    </div>
  );
}
