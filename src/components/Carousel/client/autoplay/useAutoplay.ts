import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutoplayInput {
  enabled: boolean;
  isPaused: boolean;
  isAtEnd: boolean;
  intervalMs: number;
  /**
   * Poll-time tick gate, checked when the timer FIRES — deliberately a getter
   * and not a reactive flag: its sources (touch anywhere on the glass, scroll
   * and browser-chrome activity) change at input frequency, and flipping
   * React state on a touchstart re-rendered the whole deck at the exact
   * moment a finger landed, visibly hitching an in-flight ride. A deferred
   * tick re-arms a full interval — the same resume feel as every other pause.
   */
  shouldDeferTick?: () => boolean;
  hoverPauseDelayMs: number;
  ignoreHover: boolean;
  onStep: () => void;
  onGoToStart: () => void;
}

export interface AutoplayApi {
  handleHoverChange: (hovering: boolean) => void;
}

/**
 * Drives the autoplay loop.
 * - The base `setTimeout` is suppressed while `enabled` is false, or
 *   `isPaused` is true, or the internal hover-pause is active.
 * - Hover-pause has a debounce so cursor jitter does not toggle the timer.
 * - On the final page in finite mode, the next step loops back via
 *   `onGoToStart` to make the loop visually continuous.
 */
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
  }, [enabled, internalPaused, intervalMs, isAtEnd, isPaused, onGoToStart, onStep, shouldDeferTick]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  return { handleHoverChange };
}
