import { useEffect, useState } from "react";
import { Experience } from "./three/Experience";
import { Cursor } from "./ui/Cursor";
import { Narrative } from "./ui/Narrative";
import { Timeline, Controls, Veil, StoryHint } from "./ui/Chrome";
import { Loader } from "./ui/Loader";
import { world, useUI, scrollTimeline, leaveExploration, setWindowPaused } from "./state";

function detect() {
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  world.reducedMotion = rm;
  if (rm) document.body.classList.add("rm");
  const cores = navigator.hardwareConcurrency || 4;
  world.quality = cores >= 8 ? 1 : cores >= 6 ? 0.8 : 0.6;
  world.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  if (rm) world.dpr = Math.min(world.dpr, 1.25);
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const entered = useUI((s) => s.entered);

  useEffect(() => {
    detect();
    setBooted(true);
  }, []);

  useEffect(() => {
    const syncFocus = () => setWindowPaused(document.hidden || !document.hasFocus());
    window.addEventListener("blur", syncFocus);
    window.addEventListener("focus", syncFocus);
    document.addEventListener("visibilitychange", syncFocus);
    syncFocus();
    return () => {
      window.removeEventListener("blur", syncFocus);
      window.removeEventListener("focus", syncFocus);
      document.removeEventListener("visibilitychange", syncFocus);
    };
  }, []);

  useEffect(() => {
    if (!entered) return;
    const leave = leaveExploration;
    const onWheel = (e: WheelEvent) => {
      if (world.exploring) {
        if (world.canLeave && !world.prince.sitting && e.deltaY > 0) leave();
        return;
      }
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      scrollTimeline(step * 0.00105);
    };
    const onKey = (e: KeyboardEvent) => {
      if(e.repeat)return;
      if(e.target instanceof Element && e.target.closest("button,a,input,textarea"))return;
      if (world.exploring) {
        if (e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          if (world.canLeave && !world.prince.sitting) leave();
        }
        return;
      }
      if (e.key === "PageDown" || e.key === " ") { e.preventDefault();scrollTimeline(.5,true); }
      if (e.key === "PageUp") { e.preventDefault();scrollTimeline(-.5,true); }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    let touchY=0,touchOriginY=0,touchUsed=false;
    const touchStart=(e:TouchEvent)=>{touchY=e.touches[0]?.clientY??0;touchOriginY=touchY;touchUsed=false;};
    const touchMove=(e:TouchEvent)=>{
      const y=e.touches[0]?.clientY??touchY;touchY=y;
      if(world.exploring){if(world.canLeave&&!world.prince.sitting&&touchOriginY-y>24)leave();return;}
      if(!touchUsed && touchOriginY-y>32){touchUsed=true;scrollTimeline(1);}
    };
    window.addEventListener("touchstart",touchStart,{passive:true});
    window.addEventListener("touchmove",touchMove,{passive:true});
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart",touchStart);
      window.removeEventListener("touchmove",touchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [entered]);

  if (!booted) return null;

  return (
    <>
      <Experience />
      <Veil />
      <div className="vignette" />
      <div className="grain" />
      <Narrative />
      <div className="ui-layer">
        <Timeline />
        <Controls />
        <StoryHint />
      </div>
      <Loader />
      <Cursor />
    </>
  );
}
