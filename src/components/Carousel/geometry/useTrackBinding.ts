import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  measureSlotSize,
  trackCssTransform,
  trackPixelTransform,
} from "../domain";
import { useIsomorphicLayoutEffect } from "../../../shared";
import type { VisualPositionSource } from "../position";

const RESIZE_EPSILON_PX = 0.5;
const RASTER_WARMUP_PIXEL_NUDGE = 0.05;
const RASTER_WARMUP_DURATION_MS = 96;

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
  cancelCompositorMotion: (position: number) => void;
  warmCompositorLayer: () => void;
}

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
  const rasterWarmupAnimationRef = useRef<Animation | null>(null);

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

  const readLivePosition = useCallback(
    () =>
      compositorAnimationRef.current !== null
        ? visualPosition.sampleNow()
        : visualPosition.getSnapshot().position,
    [visualPosition],
  );

  const cancelRasterWarmup = useCallback(() => {
    const animation = rasterWarmupAnimationRef.current;
    if (!animation) return;
    rasterWarmupAnimationRef.current = null;
    animation.cancel();
  }, []);

  const writePosition = useCallback(
    (position: number, source: "frame" | "geometry" = "frame") => {
      const track = trackRef.current;
      if (!track) return;
      if (source === "frame" && compositorAnimationRef.current !== null) return;

      const transform = resolveTransform(position);
      const changed = lastTransformRef.current !== transform;
      if (!changed) return;

      track.style.transform = transform;
      lastTransformRef.current = transform;
    },
    [resolveTransform, trackRef],
  );

  const cancelCompositorMotion = useCallback(
    (position: number) => {
      cancelRasterWarmup();
      const animation = compositorAnimationRef.current;
      if (!animation) return;
      compositorAnimationRef.current = null;

      const track = trackRef.current;
      if (!track) {
        animation.cancel();
        return;
      }

      const transform = resolveTransform(position);
      animation.cancel();
      track.style.transform = transform;
      lastTransformRef.current = transform;
    },
    [cancelRasterWarmup, resolveTransform, trackRef],
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

      cancelRasterWarmup();
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

      let animation: Animation;
      try {
        animation = track.animate(
          [{ transform: fromTransform }, { transform: toTransform }],
          {
            duration,
            easing,
            fill: "both",
          },
        );
      } catch {
        return false;
      }

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

      return true;
    },
    [cancelCompositorMotion, cancelRasterWarmup, trackRef],
  );

  const warmCompositorLayer = useCallback(() => {
    const track = trackRef.current;
    const slot = slotSizeRef.current;
    if (
      !track ||
      slot === null ||
      !(slot > 0) ||
      compositorAnimationRef.current !== null ||
      typeof track.animate !== "function"
    ) {
      return;
    }

    const position = readLivePosition();
    const fromTransform = trackPixelTransform(
      position,
      renderWindowStartRef.current,
      slot,
    );
    const toTransform = trackPixelTransform(
      position + RASTER_WARMUP_PIXEL_NUDGE / slot,
      renderWindowStartRef.current,
      slot,
    );
    if (fromTransform === toTransform) return;

    cancelRasterWarmup();

    let animation: Animation;
    try {
      animation = track.animate(
        [
          { transform: fromTransform },
          { transform: toTransform },
          { transform: fromTransform },
        ],
        {
          duration: RASTER_WARMUP_DURATION_MS,
          easing: "linear",
          fill: "none",
        },
      );
    } catch {
      return;
    }

    rasterWarmupAnimationRef.current = animation;
    const clear = () => {
      if (rasterWarmupAnimationRef.current === animation) {
        rasterWarmupAnimationRef.current = null;
      }
    };
    animation.onfinish = clear;
    animation.oncancel = clear;
  }, [cancelRasterWarmup, readLivePosition, trackRef]);

  const readCurrentPosition = useCallback(
    () => readLivePosition(),
    [readLivePosition],
  );

  const syncGeometry = useCallback(
    (width?: number) => {
      const currentPosition = readLivePosition();
      cancelCompositorMotion(currentPosition);
      measure(width);
      writePosition(currentPosition, "geometry");
    },
    [
      cancelCompositorMotion,
      measure,
      readLivePosition,
      writePosition,
    ],
  );

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

  const getSlotSize = useCallback(() => slotSizeRef.current ?? 0, []);

  useEffect(
    () => () => {
      rasterWarmupAnimationRef.current?.cancel();
      rasterWarmupAnimationRef.current = null;
      compositorAnimationRef.current?.cancel();
      compositorAnimationRef.current = null;
    },
    [],
  );

  return {
    readCurrentPosition,
    getSlotSize,
    startCompositorMotion,
    cancelCompositorMotion,
    warmCompositorLayer,
  };
}
