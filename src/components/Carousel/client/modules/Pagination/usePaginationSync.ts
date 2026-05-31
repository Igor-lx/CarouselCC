import { useEffect, useRef, useState } from "react";

import type { MoveReason } from "../../state";

interface UsePaginationSyncInput {
  targetPageIndex: number;
  autoplayMotionDuration: number;
  shouldSyncInstantly: boolean;
  autoplayPaginationFactor: number;
}

/**
 * Whether the pagination dot should jump straight to the target page instead
 * of waiting out the autoplay delay.
 *
 * Instant for every non-autoplay move — clicks, gestures, the initial state —
 * and whenever reduced motion is on. An autoplay move always observes the
 * delay, *including a finite-mode loop-back* (which travels via `GO_TO`): the
 * dot-rolling semantics are the same for an ordinary autoplay step and the
 * loop-back jump. A user-initiated `GO_TO` is non-autoplay, so it is already
 * covered by the first clause and needs no separate jump term.
 */
export const resolvePaginationInstantSync = (
  moveReason: MoveReason | null,
  isReducedMotion: boolean,
): boolean => moveReason !== "autoplay" || isReducedMotion;

const resolveDelay = (autoplayMotionDuration: number, factor: number) => {
  if (!Number.isFinite(autoplayMotionDuration) || autoplayMotionDuration <= 0) {
    return 0;
  }
  if (!(factor > 0 && factor < 1)) return 0;
  return autoplayMotionDuration * factor;
};

/**
 * Returns the page index the pagination dots should *show*. Differs from
 * `targetPageIndex` during autoplay: the dot switches at
 * `autoplayMotionDuration * autoplayPaginationFactor`, not immediately.
 */
export function usePaginationSync({
  targetPageIndex,
  autoplayMotionDuration,
  shouldSyncInstantly,
  autoplayPaginationFactor,
}: UsePaginationSyncInput): number {
  const [displayed, setDisplayed] = useState(targetPageIndex);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const delay = shouldSyncInstantly
      ? 0
      : resolveDelay(autoplayMotionDuration, autoplayPaginationFactor);

    if (delay <= 0) {
      setDisplayed((prev) => (prev === targetPageIndex ? prev : targetPageIndex));
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setDisplayed((prev) => (prev === targetPageIndex ? prev : targetPageIndex));
    }, delay);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    autoplayMotionDuration,
    autoplayPaginationFactor,
    shouldSyncInstantly,
    targetPageIndex,
  ]);

  return displayed;
}
