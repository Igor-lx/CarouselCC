// See docs/architecture/geometry.md
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  measureSlotSize,
  trackCssTransform,
  trackPixelTransform,
} from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";
import { isWaapiSupported } from "../../../../shared";
import { keyframesAlongStops, startPinnedAnimation } from "../motion";
import { isDroppedFallbackFrame, type VisualPositionSource } from "../visual-position";

const RESIZE_EPSILON_PX = 0.5;

interface UseTrackBindingInput {
  trackRef: RefObject<HTMLDivElement | null>;
  layoutOrigin: number;
  visibleSlidesCount: number;
  visualPosition: VisualPositionSource;
}

export interface TrackCompositorMotionOptions {
  from: number;
  to: number;
  duration: number;
  /** Percent-progress curve as evenly-spaced stops (one keyframe per stop). */
  stops: readonly number[];
  /** Segment clock origin; the animation's `startTime` is pinned to it. */
  startedAt: number;
}

export interface TrackBindingApi {
  readCurrentPosition: () => number;
  getSlotSize: () => number;
  /** Start a compositor ride; `false` when not possible (caller keeps JS write). */
  startCompositorMotion: (options: TrackCompositorMotionOptions) => boolean;
  /** Tear down the compositor animation and pin the track (pass the known position). */
  cancelCompositorMotion: (position?: number) => void;
}

export function useTrackBinding({
  trackRef,
  layoutOrigin,
  visibleSlidesCount,
  visualPosition,
}: UseTrackBindingInput): TrackBindingApi {
  const layoutOriginRef = useRef(layoutOrigin);
  const visibleSlidesCountRef = useRef(visibleSlidesCount);
  const slotSizeRef = useRef<number | null>(null);
  const lastTransformRef = useRef<string | null>(null);
  const lastMeasuredWidthRef = useRef<number | null>(null);
  const compositorAnimationRef = useRef<Animation | null>(null);
  const lastSyncedLayoutOriginRef = useRef<number | null>(null);

  layoutOriginRef.current = layoutOrigin;
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
      return trackPixelTransform(position, layoutOriginRef.current, slot);
    }
    return trackCssTransform(
      position,
      layoutOriginRef.current,
      visibleSlidesCountRef.current,
    );
  }, []);

  const writePosition = useCallback(
    (position: number, source: "frame" | "geometry" = "frame") => {
      const track = trackRef.current;
      if (!track) return;

      // While the compositor owns the track, a per-frame write would fight the
      // keyframes; only a `geometry` re-baseline is allowed through.
      if (source === "frame" && compositorAnimationRef.current !== null) return;

      const transform = resolveTransform(position);
      if (lastTransformRef.current === transform) return;
      track.style.transform = transform;
      lastTransformRef.current = transform;
    },
    [resolveTransform, trackRef],
  );

  const cancelCompositorMotion = useCallback(
    (position?: number) => {
      const animation = compositorAnimationRef.current;
      if (!animation) return;
      compositorAnimationRef.current = null;

      const track = trackRef.current;
      if (!track) {
        animation.cancel();
        return;
      }

      // Freeze at a known transform first: resolve an explicit position, else
      // pay a getComputedStyle read of the live compositor curve.
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

      // Hand paint back to the JS loop — a passively-run compositor segment
      // has no frame loop, so without this the strip freezes until the settle.
      visualPosition.wake();
    },
    [resolveTransform, trackRef, visualPosition],
  );

  const startCompositorMotion = useCallback(
    ({ from, to, duration, stops, startedAt }: TrackCompositorMotionOptions): boolean => {
      const track = trackRef.current;
      const slot = slotSizeRef.current;
      if (
        !track ||
        slot === null ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        !(duration > 0) ||
        stops.length < 2
      ) {
        return false;
      }

      cancelCompositorMotion(from); // replace any in-flight ride at the new origin

      const keyframes: Keyframe[] = keyframesAlongStops(
        from,
        to,
        stops,
        (position) => ({
          transform: trackPixelTransform(position, layoutOriginRef.current, slot),
        }),
      );
      const fromTransform = keyframes[0]!.transform as string;
      const toTransform = keyframes[keyframes.length - 1]!.transform as string;

      // Paint the origin synchronously so the first compositor frame agrees
      // with the sampler's `from` plateau.
      track.style.transform = fromTransform;
      lastTransformRef.current = fromTransform;

      const animation = startPinnedAnimation(track, keyframes, {
        duration,
        startedAt,
      });
      if (!animation) return false;

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
    [cancelCompositorMotion, trackRef],
  );

  // Where the track is actually painted: snapshot for a JS track, reflow-free
  // sampleNow for a composited one (painted ahead). Never read the DOM.
  const readCurrentPosition = useCallback(
    () =>
      compositorAnimationRef.current !== null
        ? visualPosition.sampleNow()
        : visualPosition.getSnapshot().position,
    [visualPosition],
  );

  const syncGeometry = useCallback(
    (width?: number) => {
      const previousSlot = slotSizeRef.current;
      const nextSlot = measure(width);

      // Judged through the SLOT, not raw px, so a height-only change (URL bar)
      // never tears down a healthy compositor ride.
      if (
        nextSlot !== null &&
        nextSlot === previousSlot &&
        lastSyncedLayoutOriginRef.current === layoutOriginRef.current
      ) {
        return;
      }
      lastSyncedLayoutOriginRef.current = layoutOriginRef.current;

      // Read the position BEFORE teardown, else readCurrentPosition answers for
      // a JS track that never painted these frames.
      const position = readCurrentPosition();
      cancelCompositorMotion(position);
      writePosition(position, "geometry");
    },
    [cancelCompositorMotion, measure, readCurrentPosition, writePosition],
  );

  // Disable CSS transition once: it would double-animate against the per-tick
  // JS transform write. The track element is stable for the carousel's life.
  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    if (track) track.style.transition = "none";
  }, [trackRef]);

  useIsomorphicLayoutEffect(() => {
    syncGeometry();
  }, [layoutOrigin, syncGeometry, visibleSlidesCount]);

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

  // Per-frame paint (drag + no-WAAPI fallback). Drop the shared Nth running
  // frame so track and widget shed exactly the same frames; drag frames paint.
  useIsomorphicLayoutEffect(() => {
    const applyFallbackSkip = !isWaapiSupported();
    return visualPosition.subscribe(
      (frame) => {
        if (applyFallbackSkip && isDroppedFallbackFrame(frame)) return;
        writePosition(frame.position);
      },
      { emitCurrent: true },
    );
  }, [visualPosition, writePosition]);

  const getSlotSize = useCallback(() => slotSizeRef.current ?? 0, []);

  // Self-contained unmount cancel — the animation is tied to a leaving element.
  useEffect(
    () => () => {
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
  };
}
