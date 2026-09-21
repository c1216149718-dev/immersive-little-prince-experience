import { useEffect, useRef } from "react";
import { world, useUI, CHAPTERS, T, jumpTo, restart, smooth } from "../state";
import { BEATS } from "../presentation";
import { audio } from "../audio";

export function Timeline() {
  const chapter = useUI((s) => s.chapter);
  const faded = useUI((s) => s.uiFaded);
  const rail = useRef<HTMLElement>(null!);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (rail.current) rail.current.style.setProperty("--p", `${((world.t / T.END) * 100).toFixed(2)}%`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <nav className="timeline" style={{ opacity: faded ? .65 : 1 }} aria-label="Chapters">
      <div className="rail">
        <i ref={rail} />
      </div>
      <ul>
        {CHAPTERS.map((c) => (
          <li key={c.key} className={chapter === c.key ? "active" : ""}>
            <button aria-current={chapter === c.key ? "step" : undefined} onClick={() => jumpTo(c.t)}>{c.label}</button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Controls() {
  const audioOn = useUI((s) => s.audioOn);
  const faded = useUI((s) => s.uiFaded);
  const ended = useUI(s => s.beat === BEATS.length - 1 && !s.playing);
  const set = useUI((s) => s.set);
  return (
    <div className="chrome" style={{ opacity: faded ? 0.25 : 1 }}>
      <button
        onClick={() => {
          const next = !audioOn;
          if (next) audio.start();
          audio.setMuted(!next);
          set({ audioOn: next });
        }}
      >
        {audioOn ? "sound · on" : "sound · off"}
      </button>
      {ended && <button onClick={restart}>begin again</button>}
    </div>
  );
}

/** B612 to Rose arrival; the Worlds star bridge now owns its own spatial light. */
export function Veil() {
  const el = useRef<HTMLDivElement>(null!);
  useEffect(() => {
    let raf = 0;
    const peak = (t: number, c: number, wIn: number, wOut: number) => (t < c ? smooth(c - wIn, c, t) : 1 - smooth(c, c + wOut, t));
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = world.t;
      const glass = peak(t, 2.95, 0.3, 0.32);
      let color = "";
      let opacity = 0;
      if (glass > 0.001) {
        color = "rgba(70, 22, 39, 1)";
        opacity = glass * 0.96;
      }
      const e = el.current;
      e.style.opacity = opacity.toFixed(3);
      e.style.background = color ? `radial-gradient(ellipse at 50% 50%, ${color} 0%, ${color.replace(", 1)", ", 0.92)")} 60%, ${color.replace(", 1)", ", 0.8)")} 100%)` : "";
      e.style.backdropFilter = "none";
      (e.style as any).webkitBackdropFilter = "none";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={el} className="veil" />;
}

/** Quiet cue while the story waits for its viewer. */
export function StoryHint() {
  const entered = useUI(s => s.entered);
  const playing = useUI(s => s.playing);
  const exploring = useUI(s => s.exploring);
  const beat = useUI(s => s.beat);
  if (!entered || playing || exploring || beat === BEATS.length - 1) return null;
  return <div className="story-hint">scroll down for the next chapter ↓</div>;
}
