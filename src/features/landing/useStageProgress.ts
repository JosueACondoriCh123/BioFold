import { useEffect, useRef, useState, type RefObject } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export interface StageProgress {
  progress: number;
  /** True when the visitor asked for reduced motion; the stage then renders flat. */
  reduced: boolean;
}

/**
 * Scroll progress of a pinned stage, expressed as 0..1 across its scroll track.
 *
 * Under reduced motion no frame ever runs and `reduced` is reported, so the
 * caller can drop the motion styling entirely instead of overriding it in CSS.
 */
export function useStageProgress(track: RefObject<HTMLElement | null>): StageProgress {
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION);
    if (query?.matches) {
      setReduced(true);
      return;
    }
    setReduced(false);

    const measure = () => {
      frame.current = 0;
      const node = track.current;
      if (!node) return;
      const { top, height } = node.getBoundingClientRect();
      const travel = height - window.innerHeight;
      if (travel <= 0) {
        setProgress(0);
        return;
      }
      const raw = -top / travel;
      setProgress(raw < 0 ? 0 : raw > 1 ? 1 : raw);
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, [track]);

  return { progress, reduced };
}

/**
 * Local progress of one panel inside the stage, mapped to opacity and offset.
 *
 * Each panel owns an equal slice of the track. Inside its slice it slides up
 * into place, holds, then slides out — the motion of the reference design.
 */
export function panelMotion(progress: number, index: number, count: number) {
  const local = progress * count - index;

  const ENTER = 0.22;
  const EXIT = 0.78;

  // The first panel is already on screen when the page loads; it only leaves.
  if (index === 0 && local < ENTER) return { opacity: 1, offset: 0, active: true };

  if (local <= -1 || local >= 2) return { opacity: 0, offset: 40, active: false };
  if (local < 0) return { opacity: 0, offset: 40, active: false };
  if (local < ENTER) {
    const t = local / ENTER;
    return { opacity: t, offset: 40 * (1 - t), active: t > 0.5 };
  }
  if (local < EXIT) return { opacity: 1, offset: 0, active: true };
  if (local < 1) {
    const t = (local - EXIT) / (1 - EXIT);
    return { opacity: 1 - t, offset: -32 * t, active: t < 0.5 };
  }
  return { opacity: 0, offset: -32, active: false };
}
