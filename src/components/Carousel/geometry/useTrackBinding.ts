import { useCallback, useRef, type RefObject } from "react";

import {
  measureSlotSize,
  trackCssTransform,
  trackPixelTransform,
} from "../domain";
import { useIsomorphicLayoutEffect } from "../../../shared";
import type { VisualPositionSource } from "../position";
import { traceCarousel } from "../debug/performanceTrace";

const RESIZE_EPSILON_PX = 0.5;

interface UseTrackBindingInput {
  trackRef: RefObject<HTMLDivElement | null>;
  renderWindowStart: number;
  visibleSlidesCount: number;
  visualPosition: VisualPositionSource;
}

export interface TrackCompositorMotionOptions {
  from: number;
  to: number;
  duration: number;
  easing: string;
}

export interface TrackBindingApi {
  readCurrentPosition: () => number;
  getSlotSize: () => number;
  startCompositorMotion: (options: TrackCompositorMotionOptions) => boolean;
  cancelCompositorMotion: (position?: number) => void;
}

/**
 * Wires the track DOM to the visual position source. Owns the slot-size
 * measurement (ResizeObserver + window resize) and the transform write
 * (subscribes to the visual position and mutates `transform` directly).
 * Returns a small imperative API used by the gesture adapter and the
 * navigation controller.
 */
export function useTrackBinding({
  trackRef,
  renderWindowStart,
  visibleSlidesCount,
  visualPosition,
}: UseTrackBindingInput): TrackBindingApi {
  const renderWindowStartRef = useRef(renderWindowStart);
  const visibleSlidesCountRef = useRef(visibleSlidesCount);
  const slotSizeRef = useRef<number | null>(null);
  const lastTransformRef = useRef<string | null>(null);
  const lastMeasuredWidthRef = useRef<number | null>(null);
  const compositorAnimationRef = useRef<Animation | null>(null);

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
    (position: number, source: "frame" | "geometry" = "frame") => {
      const track = trackRef.current;
      if (!track) return;
      const transform = resolveTransform(position);
      const changed = lastTransformRef.current !== transform;
      const isCompositedFrame =
        source === "frame" && compositorAnimationRef.current !== null;

      traceCarousel("track:write", {
        changed,
        composited: isCompositedFrame,
        position,
        renderWindowStart: renderWindowStartRef.current,
        slotSize: slotSizeRef.current,
        source,
      });

      if (isCompositedFrame) return;

      if (changed) {
        track.style.transform = transform;
        lastTransformRef.current = transform;
      }
    },
    [resolveTransform, trackRef],
  );

  const cancelCompositorMotion = useCallback(
    (position?: number) => {
      const animation = compositorAnimationRef.current;
      if (!animation) return;
      compositorAnimationRef.current = null;

      const track = trackRef.current;
      if (track) {
        const transform =
          typeof position === "number"
            ? resolveTransform(position)
            : typeof window !== "undefined"
              ? window.getComputedStyle(track).transform
              : null;
        animation.cancel();
        if (transform && transform !== "none") {
          track.style.transform = transform;
          lastTransformRef.current = transform;
        }
      } else {
        animation.cancel();
      }
    },
    [resolveTransform, trackRef],
  );

  const startCompositorMotion = useCallback(
    ({ from, to, duration, easing }: TrackCompositorMotionOptions) => {
      const track = trackRef.current;
      const slot = slotSizeRef.current;
      if (
        !track ||
        slot === null ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        !(duration > 0) ||
        typeof track.animate !== "function"
      ) {
        return false;
      }

      cancelCompositorMotion(from);

      const fromTransform = trackPixelTransform(
        from,
        renderWindowStartRef.current,
        slot,
      );
      const toTransform = trackPixelTransform(
        to,
        renderWindowStartRef.current,
        slot,
      );

      track.style.transform = fromTransform;
      lastTransformRef.current = fromTransform;

      const animation = track.animate(
        [{ transform: fromTransform }, { transform: toTransform }],
        {
          duration,
          easing,
          fill: "both",
        },
      );

      compositorAnimationRef.current = animation;
      animation.onfinish = () => {
        if (compositorAnimationRef.current !== animation) return;
        compositorAnimationRef.current = null;
        track.style.transform = toTransform;
        lastTransformRef.current = toTransform;
        animation.cancel();
      };
      animation.oncancel = () => {
        if (compositorAnimationRef.current === animation) {
          compositorAnimationRef.current = null;
        }
      };

      traceCarousel("track:compositor-start", {
        duration,
        easing,
        from,
        renderWindowStart: renderWindowStartRef.current,
        to,
      });

      return true;
    },
    [cancelCompositorMotion, trackRef],
  );

  const syncGeometry = useCallback(
    (width?: number) => {
      traceCarousel("track:syncGeometry:start", {
        renderWindowStart: renderWindowStartRef.current,
        width,
      });
      cancelCompositorMotion(visualPosition.getSnapshot().position);
      measure(width);
      writePosition(visualPosition.getSnapshot().position, "geometry");
      traceCarousel("track:syncGeometry:end", {
        renderWindowStart: renderWindowStartRef.current,
        slotSize: slotSizeRef.current,
      });
    },
    [cancelCompositorMotion, measure, visualPosition, writePosition],
  );

  // CSS transitions would double-animate both JS-sampled and WAAPI-driven
  // transform writes. Disable them once; compositor motion is explicit.
  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    if (track) track.style.transition = "none";
  }, [trackRef]);

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
        (frame) => writePosition(frame.position, "frame"),
        { emitCurrent: true },
      ),
    [visualPosition, writePosition],
  );

  const readCurrentPosition = useCallback(
    () => visualPosition.getSnapshot().position,
    [visualPosition],
  );

  const getSlotSize = useCallback(() => slotSizeRef.current ?? 0, []);

  return {
    readCurrentPosition,
    getSlotSize,
    startCompositorMotion,
    cancelCompositorMotion,
  };
}
