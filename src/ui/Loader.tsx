import { useEffect, useState } from "react";
import { useUI } from "../state";
import { starReveal } from "../three/Starfield";
import { audio } from "../audio";

export function Loader() {
  const entered = useUI((s) => s.entered);
  const set = useUI((s) => s.set);
  const [ready, setReady] = useState(false);
  const [lineOn, setLineOn] = useState(false);

  useEffect(() => {
    // the loading itself is the first image: stars appear one after another
    let raf = 0;
    const start = performance.now();
    const dur = 3200;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / dur);
      starReveal.v = k * k * (3 - 2 * k);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setReady(true);
    };
    raf = requestAnimationFrame(tick);
    const id = window.setTimeout(() => setLineOn(true), 1200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, []);

  const enter = (withSound: boolean) => {
    if (withSound) {
      audio.start();
      audio.setMuted(false);
    }
    set({ entered: true, audioOn: withSound, loaded: true });
  };

  return (
    <div className={`loader ${entered ? "gone" : ""}`} style={{ background: "transparent", flexDirection: "column", gap: "2.2rem" }}>
      <p
        className="hand"
        style={{
          color: "var(--gold)",
          fontSize: "1.05rem",
          opacity: lineOn ? 0.75 : 0,
          transition: "opacity 2.4s ease",
          letterSpacing: "0.02em",
          margin: 0,
        }}
      >
        the stars are gathering
      </p>
      <button className={`enter ${ready ? "show" : ""}`} onClick={() => enter(true)} disabled={!ready}>
        Enter the story
      </button>
      <button
        onClick={() => enter(false)}
        className="serif"
        style={{
          background: "none",
          border: "none",
          color: "var(--cream)",
          opacity: ready ? 0.32 : 0,
          transition: "opacity 1.6s ease 0.6s",
          fontSize: "0.72rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginTop: "-1.2rem",
        }}
      >
        enter in silence
      </button>
      <p className="sound-line serif" style={{ opacity: ready ? 0.3 : 0, transition: "opacity 2s ease" }}>
        a desktop journey · headphones recommended · scroll to continue · scenes unfold in their own time
      </p>
    </div>
  );
}
