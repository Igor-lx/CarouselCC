import { useState, type RefObject } from "react";

import { measureSlotSize } from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";

const SIZE_EPSILON_PX = 1;

interface UseMeasuredSlotSizeInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

/**
 * The live slot width in px, MEASURED from the real viewport element — the
 * single reactive "how wide is one slide" signal for low-frequency consumers
 * (the responsive `sizes` hint, the slot-adaptive swipe config).
 *
 * Measured, not computed: the slot is not a clean fraction of the window (the
 * viewport is capped, padded and gapped), so any JS formula would be a second,
 * drift-prone source of truth next to the CSS. Reuses the same
 * `measureSlotSize` primitive the track binding measures with — one
 * measurement definition.
 *
 * Cadence: recomputed only when the slot actually changes (mount, resize,
 * slide-count change) and re-renders only when the rounded value moves past
 * the epsilon — it never touches the motion hot path. `null` until the first
 * measurement (SSR / pre-mount), so consumers can fall back explicitly.
 */
export function useMeasuredSlotSize({
  viewportRef,
  visibleSlidesCount,
}: UseMeasuredSlotSizeInput): number | null {
  const [slotPx, setSlotPx] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof window === "undefined") return;

    const remeasure = () => {
      const slot = measureSlotSize(viewport, visibleSlidesCount);
      if (!(slot > 0)) return;
      setSlotPx((previous) =>
        previous !== null && Math.abs(previous - slot) < SIZE_EPSILON_PX
          ? previous
          : Math.round(slot),
      );
    };

    remeasure();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(remeasure);
      observer.observe(viewport);
    }
    window.addEventListener("resize", remeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [viewportRef, visibleSlidesCount]);

  return slotPx;
}
