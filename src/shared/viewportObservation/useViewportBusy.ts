// See ./README.md — a non-reactive getter (must NOT re-render on touch).
import { useCallback, useEffect, useRef } from "react";

interface UseViewportBusyInput {
  enabled: boolean;
  /** Busy window, measured from the last activity signal; self-extends. */
  quietDelayMs: number;
}

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
