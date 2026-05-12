import { useEffect, useRef, useState } from "react";

interface UsePaginationSyncInput {
  targetPageIndex: number;
  motionDuration: number;
  shouldSyncInstantly: boolean;
  autoplayPaginationFactor: number;
}

const resolveDelay = (motionDuration: number, factor: number) => {
  if (!Number.isFinite(motionDuration) || motionDuration <= 0) return 0;
  if (!(factor > 0 && factor < 1)) return 0;
  return motionDuration * factor;
};

/**
 * Returns the page index the pagination dots should *show*. Differs from
 * `targetPageIndex` during autoplay: the dot switches at
 * `motionDuration * autoplayPaginationFactor`, not immediately.
 */
export function usePaginationSync({
  targetPageIndex,
  motionDuration,
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
      : resolveDelay(motionDuration, autoplayPaginationFactor);

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
  }, [autoplayPaginationFactor, motionDuration, shouldSyncInstantly, targetPageIndex]);

  return displayed;
}
