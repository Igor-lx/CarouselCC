import { useEffect, useRef, useState } from "react";

interface UsePaginationSyncInput {
  targetPageIndex: number;
  autoplayMotionDuration: number;
  shouldSyncInstantly: boolean;
  autoplayPaginationFactor: number;
}

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
