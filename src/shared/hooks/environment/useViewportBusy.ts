import { useEffect, useRef, useState } from "react";

interface UseViewportBusyInput {
  /** No listeners and a constant `false` while disabled — zero cost. */
  enabled: boolean;
  /**
   * How long after the LAST activity signal the viewport is still considered
   * busy. The window self-extends: every signal re-arms it, so it always
   * covers the full tail of whatever is happening (a fling of any length, a
   * browser-chrome settle of any duration) without being tuned to either.
   */
  quietDelayMs: number;
}

/**
 * Is the viewport visually unsettled by user interaction — a finger anywhere
 * on the glass, an ongoing page scroll (including the post-lift fling), or
 * the browser chrome resizing (the URL bar hiding/showing and settling)?
 *
 * WHY this exists: when the mobile browser toolbar settles after a scroll,
 * the system display compositor must aggregate two live surfaces (the page +
 * the animating browser UI). On weak GPUs frames of the page then miss the
 * presentation latch for 2–3 vsyncs — anything MOVING on the page at that
 * moment visibly hiccups (an eye-tracked "backward bounce"), while the frames
 * themselves are produced on time. That stall is below the web platform:
 * pages get no presentation feedback and no lever over the compositor. The
 * one thing a page CAN do is not START avoidable motion while the viewport
 * is unsettled — this hook is that signal (measured on device: 33–50 ms
 * present gaps at every scroll stop; see PERF-INVESTIGATION §9.3).
 *
 * Busy is raised SYNCHRONOUSLY on the first touch; it decays `quietDelayMs`
 * after the last observed signal, provided no finger remains on the glass.
 */
export function useViewportBusy({
  enabled,
  quietDelayMs,
}: UseViewportBusyInput): boolean {
  const [isBusy, setIsBusy] = useState(false);
  const fingersRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Every signal re-arms the quiet window; it may only expire with no
    // finger down.
    const rearm = () => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (fingersRef.current === 0) setIsBusy(false);
      }, quietDelayMs);
    };

    const onTouchStart = (event: TouchEvent) => {
      fingersRef.current = event.touches.length;
      clearTimer();
      setIsBusy(true);
    };
    const onTouchSettle = (event: TouchEvent) => {
      fingersRef.current = event.touches.length;
      if (fingersRef.current === 0) rearm();
    };
    const onActivity = () => {
      // Scroll frames (incl. fling after the lift) and browser-chrome
      // resizes: keep the window open for as long as they keep coming.
      if (timerRef.current !== null || fingersRef.current > 0) rearm();
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener("touchstart", onTouchStart, opts);
    document.addEventListener("touchend", onTouchSettle, opts);
    document.addEventListener("touchcancel", onTouchSettle, opts);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("resize", onActivity);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onActivity);

    return () => {
      document.removeEventListener("touchstart", onTouchStart, opts);
      document.removeEventListener("touchend", onTouchSettle, opts);
      document.removeEventListener("touchcancel", onTouchSettle, opts);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("resize", onActivity);
      viewport?.removeEventListener("resize", onActivity);
      clearTimer();
      fingersRef.current = 0;
      setIsBusy(false);
    };
  }, [enabled, quietDelayMs]);

  return enabled && isBusy;
}
