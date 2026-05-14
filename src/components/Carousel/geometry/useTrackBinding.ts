import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  measureSlotSize,
  trackCssTransform,
  trackPixelTransform,
} from "../domain";
import { useIsomorphicLayoutEffect } from "../../../shared";
import type { VisualPositionSource } from "../position";

const RESIZE_EPSILON_PX = 0.5;

interface UseTrackBindingInput {
  trackRef: RefObject<HTMLDivElement | null>;
  renderWindowStart: number;
  visibleSlidesCount: number;
  visualPosition: VisualPositionSource;
  applyVisualPosition: (position: number) => void;
}

export interface TrackBindingApi {
  applyTrackPosition: (position: number) => void;
  readCurrentPosition: () => number;
  getSlotSize: () => number;
}

/**
 * Wires the track DOM to the visual position source. Owns the slot-size
 * measurement (ResizeObserver + window resize) and the transform write
 * (subscribes to the visual position and mutates `transform` directly).
 * Returns a small imperative API used by the gesture adapter and the
 * navigation controller. Imperative gesture writes are published back into
 * the visual position stream so track, widgets, and motion handoff share one
 * source of truth.
 */
export function useTrackBinding({
  trackRef,
  renderWindowStart,
  visibleSlidesCount,
  visualPosition,
  applyVisualPosition,
}: UseTrackBindingInput): TrackBindingApi {
  const renderWindowStartRef = useRef(renderWindowStart);
  const visibleSlidesCountRef = useRef(visibleSlidesCount);
  const slotSizeRef = useRef<number | null>(null);
  const lastTransformRef = useRef<string | null>(null);
  const lastTransitionRef = useRef<string | null>(null);
  const lastMeasuredWidthRef = useRef<number | null>(null);
  const currentPositionRef = useRef(0);

  renderWindowStartRef.current = renderWindowStart;
  visibleSlidesCountRef.current = visibleSlidesCount;

  const measure = useCallback(
    (viewportWidth?: number) => {
      const track = trackRef.current;
      const viewport = track?.parentElement;
      if (!viewport) {
        slotSizeRef.current = null;
        return null;
      }
      const width = viewportWidth ?? viewport.offsetWidth;
      const slot = measureSlotSize(viewport, visibleSlidesCountRef.current, width);
      const next = slot > 0 ? slot : null;
      lastMeasuredWidthRef.current = width;
      slotSizeRef.current = next;
      return next;
    },
    [trackRef],
  );

  const resolveTransform = useCallback((position: number): string => {
    const slot = slotSizeRef.current;
    if (slot !== null) {
      return trackPixelTransform(position, renderWindowStartRef.current, slot);
    }
    return trackCssTransform(
      position,
      renderWindowStartRef.current,
      visibleSlidesCountRef.current,
    );
  }, []);

  const writePosition = useCallback(
    (position: number) => {
      currentPositionRef.current = position;
      const track = trackRef.current;
      if (!track) return;
      const transform = resolveTransform(position);

      if (lastTransitionRef.current !== "none") {
        track.style.transition = "none";
        lastTransitionRef.current = "none";
      }

      if (lastTransformRef.current !== transform) {
        track.style.transform = transform;
        lastTransformRef.current = transform;
      }
    },
    [resolveTransform, trackRef],
  );

  const syncGeometry = useCallback(
    (width?: number) => {
      measure(width);
      writePosition(currentPositionRef.current);
    },
    [measure, writePosition],
  );

  useIsomorphicLayoutEffect(() => {
    syncGeometry();
  }, [renderWindowStart, syncGeometry, visibleSlidesCount]);

  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    const viewport = track?.parentElement;
    if (!viewport || typeof window === "undefined") return;

    const onWindowResize = () => syncGeometry();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(([entry]) => {
        const inlineSize = entry?.contentRect.width;
        if (typeof inlineSize !== "number" || !Number.isFinite(inlineSize)) {
          syncGeometry();
          return;
        }
        const previousWidth = lastMeasuredWidthRef.current;
        if (
          previousWidth !== null &&
          Math.abs(inlineSize - previousWidth) < RESIZE_EPSILON_PX
        ) {
          return;
        }
        syncGeometry(inlineSize);
      });
      observer.observe(viewport);
    }

    window.addEventListener("resize", onWindowResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [syncGeometry, trackRef]);

  useIsomorphicLayoutEffect(
    () =>
      visualPosition.subscribe(
        (frame) => writePosition(frame.position),
        { emitCurrent: true },
      ),
    [visualPosition, writePosition],
  );

  const applyTrackPosition = useCallback(
    (position: number) => {
      applyVisualPosition(position);
    },
    [applyVisualPosition],
  );

  const readCurrentPosition = useCallback(() => {
    const value = visualPosition.getSnapshot().position;
    writePosition(value);
    return value;
  }, [visualPosition, writePosition]);

  const getSlotSize = useCallback(() => slotSizeRef.current ?? 0, []);

  // Initial geometry write before any subscription
  useEffect(() => {
    syncGeometry();
  }, [syncGeometry]);

  return { applyTrackPosition, readCurrentPosition, getSlotSize };
}
