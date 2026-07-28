// See docs/architecture/geometry.md
import { useState, type RefObject } from "react";

import { measureSlotSize } from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";

/** A re-measure moving the slot less than this keeps the old value — sub-pixel
 * layout noise must not re-render every low-frequency consumer. */
const SLOT_SIZE_EPSILON_PX = 1;

interface UseMeasuredSlotSizeInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

/** Live measured slot px for low-frequency consumers; `null` until first measure. */
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
        previous !== null && Math.abs(previous - slot) < SLOT_SIZE_EPSILON_PX
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
