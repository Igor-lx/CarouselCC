// See docs/architecture/geometry.md
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";

import { measureSlotSize } from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";

/** A viewport inline-size change smaller than this is layout noise — no re-measure. */
const VIEWPORT_RESIZE_EPSILON_PX = 0.5;

/** A re-measure moving the slot less than this keeps the PUBLISHED px: sub-pixel
 * noise must not re-render every low-frequency consumer. The live raw value
 * (`getSlotSize`) is never rounded — the track paints from that one. */
const SLOT_SIZE_EPSILON_PX = 1;

interface UseSlotSizeSourceInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

export interface SlotSizeSource {
  /** The live raw slot width; `null` before the first measure. Reading it never
   * touches the DOM and never re-renders — the per-frame track write uses it. */
  getSlotSize: () => number | null;
  /** Rounded, epsilon-gated px for low-frequency consumers (`sizes`, swipe
   * tuning); `null` until measured. Changing it re-renders, by design. */
  slotPx: number | null;
  /** Fires synchronously after any measure that MOVED the slot — the geometry
   * re-baseline hook. Subscribing does not emit. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * THE slot measurement of a carousel: one ResizeObserver, one `resize` listener
 * and one `getComputedStyle` read for every consumer. Three independent copies
 * of this used to observe the same element, and two of them disagreed on the
 * answer (rounded vs raw) — see docs/architecture/geometry.md.
 */
export function useSlotSizeSource({
  viewportRef,
  visibleSlidesCount,
}: UseSlotSizeSourceInput): SlotSizeSource {
  const slotSizeRef = useRef<number | null>(null);
  const lastMeasuredWidthRef = useRef<number | null>(null);
  const visibleSlidesCountRef = useRef(visibleSlidesCount);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const [slotPx, setSlotPx] = useState<number | null>(null);

  visibleSlidesCountRef.current = visibleSlidesCount;

  const getSlotSize = useCallback(() => slotSizeRef.current, []);

  const subscribe = useCallback((listener: () => void) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  /** Measure once and publish both views; `true` when the slot actually moved. */
  const measure = useCallback(
    (viewportWidth?: number): boolean => {
      const viewport = viewportRef.current;
      if (!viewport) {
        const had = slotSizeRef.current !== null;
        slotSizeRef.current = null;
        return had;
      }

      const width = viewportWidth ?? viewport.offsetWidth;
      lastMeasuredWidthRef.current = width;
      const slot = measureSlotSize(viewport, visibleSlidesCountRef.current, width);
      const next = slot > 0 ? slot : null;
      const moved = next !== slotSizeRef.current;
      slotSizeRef.current = next;

      if (next !== null) {
        setSlotPx((previous) =>
          previous !== null && Math.abs(previous - next) < SLOT_SIZE_EPSILON_PX
            ? previous
            : Math.round(next),
        );
      }

      return moved;
    },
    [viewportRef],
  );

  const remeasure = useCallback(
    (viewportWidth?: number) => {
      if (!measure(viewportWidth)) return;
      listenersRef.current.forEach((listener) => listener());
    },
    [measure],
  );

  // Measure before paint on every mount and whenever the slot count changes;
  // the track binding's own re-baseline effect runs after this one (hook order).
  useIsomorphicLayoutEffect(() => {
    remeasure();
  }, [remeasure, visibleSlidesCount]);

  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof window === "undefined") return;

    const onWindowResize = () => remeasure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(([entry]) => {
        // contentRect avoids a layout read in the callback; the measurement
        // contract keeps the viewport's content and border boxes equal.
        const inlineSize = entry?.contentRect.width;
        if (typeof inlineSize !== "number" || !Number.isFinite(inlineSize)) {
          remeasure();
          return;
        }
        const previousWidth = lastMeasuredWidthRef.current;
        if (
          previousWidth !== null &&
          Math.abs(inlineSize - previousWidth) < VIEWPORT_RESIZE_EPSILON_PX
        ) {
          return;
        }
        remeasure(inlineSize);
      });
      observer.observe(viewport);
    }

    window.addEventListener("resize", onWindowResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [remeasure, viewportRef]);

  // Memoised so the source is safe to put in a dependency array: a fresh object
  // per render made a consumer's subscribe effect re-run on every render, and
  // React tears down ALL effects of a commit before it runs any of them — so a
  // notification emitted from inside a commit landed on an empty listener set.
  // `getSlotSize` and `subscribe` are permanently stable, so only a real slot
  // move re-identifies this.
  return useMemo(
    () => ({ getSlotSize, slotPx, subscribe }),
    [getSlotSize, slotPx, subscribe],
  );
}
