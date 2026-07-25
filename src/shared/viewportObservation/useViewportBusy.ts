import { useCallback, useEffect, useRef } from "react";

interface UseViewportBusyInput {
  /** No listeners and a constant `false` while disabled — zero cost. */
  enabled: boolean;
  /**
   * How long after the LAST activity signal the viewport is still considered
   * busy. The window self-extends: every signal refreshes it, so it always
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
 * is unsettled — this hook is that signal (measured on device: tens of ms of
 * present gaps at every scroll stop).
 *
 * DELIBERATELY NON-REACTIVE: the result is a stable GETTER, not state. The
 * first version flipped React state inside the `touchstart` handler — which
 * re-rendered the consumer subtree at the exact moment a finger LANDED, and
 * on a weak device that render visibly hitched an in-flight autoplay ride
 * (the very artifact class this hook exists to prevent). A poll-time check
 * is all a scheduler gate needs; nothing may re-render on touch. Internals
 * are refs + timestamps only — not even a timer.
 */
export function useViewportBusy({
  enabled,
  quietDelayMs,
}: UseViewportBusyInput): () => boolean {
  const fingersRef = useRef(0);
  const lastSignalRef = useRef(-Infinity);
  const enabledRef = useRef(enabled);
  const quietDelayRef = useRef(quietDelayMs);
  enabledRef.current = enabled;
  quietDelayRef.current = quietDelayMs;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const onTouchStart = (event: TouchEvent) => {
      fingersRef.current = event.touches.length;
      lastSignalRef.current = performance.now();
    };
    const onTouchSettle = (event: TouchEvent) => {
      fingersRef.current = event.touches.length;
      lastSignalRef.current = performance.now();
    };
    const onActivity = () => {
      // Scroll frames (incl. the fling after the lift) and browser-chrome
      // resizes: keep the window open for as long as they keep coming.
      lastSignalRef.current = performance.now();
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
      fingersRef.current = 0;
      lastSignalRef.current = -Infinity;
    };
  }, [enabled]);

  return useCallback(
    () =>
      enabledRef.current &&
      (fingersRef.current > 0 ||
        performance.now() - lastSignalRef.current < quietDelayRef.current),
    [],
  );
}
