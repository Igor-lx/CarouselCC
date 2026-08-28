// See docs/architecture/autoplay.md
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutoplayInput {
  enabled: boolean;
  isPaused: boolean;
  isAtEnd: boolean;
  intervalMs: number;
  /** Getter checked on tick, never a reactive flag (would re-render mid-ride). */
  shouldDeferTick?: () => boolean;
  hoverPauseDelayMs: number;
  ignoreHover: boolean;
  onStep: () => void;
  onGoToStart: () => void;
}

export interface AutoplayApi {
  handleHoverChange: (hovering: boolean) => void;
}

export function useAutoplay({
  enabled,
  isPaused,
  isAtEnd,
  intervalMs,
  shouldDeferTick,
  hoverPauseDelayMs,
  ignoreHover,
  onStep,
  onGoToStart,
}: UseAutoplayInput): AutoplayApi {
  const [internalPaused, setInternalPaused] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const toggleInternalPause = useCallback(
    (active: boolean, withDelay = false) => {
      clearHoverTimer();
      if (active && withDelay) {
        hoverTimerRef.current = setTimeout(
          () => setInternalPaused(true),
          hoverPauseDelayMs,
        );
      } else {
        setInternalPaused(active);
      }
    },
    [clearHoverTimer, hoverPauseDelayMs],
  );

  const handleHoverChange = useCallback(
    (hovering: boolean) => {
      if (!enabled || ignoreHover) return;
      toggleInternalPause(hovering, hovering);
    },
    [enabled, ignoreHover, toggleInternalPause],
  );

  useEffect(() => {
    if (enabled && !ignoreHover) return;
    clearHoverTimer();
    setInternalPaused(false);
  }, [clearHoverTimer, enabled, ignoreHover]);

  useEffect(() => {
    if (!enabled || isPaused || internalPaused) return;

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        if (shouldDeferTick?.()) {
          arm();
          return;
        }
        if (isAtEnd) onGoToStart();
        else onStep();
      }, intervalMs);
    };
    arm();
    return () => clearTimeout(timer);
  }, [
    enabled,
    internalPaused,
    intervalMs,
    isAtEnd,
    isPaused,
    onGoToStart,
    onStep,
    shouldDeferTick,
  ]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  return { handleHoverChange };
}
