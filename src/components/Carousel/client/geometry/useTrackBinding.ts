import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  measureSlotSize,
  trackCssTransform,
  trackPixelTransform,
} from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";
import type { VisualPositionSource } from "../position";

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
  /**
   * The segment's clock origin (`performance.now()` domain — the same value
   * the JS sampler runs on). The WAAPI animation's `startTime` is pinned to
   * it so the compositor traces the segment on the SAME timeline as the JS
   * controller. Without this the animation starts when the browser gets
   * around to it (commit + raster later), so the painted track would run
   * phase-shifted behind the JS curve — and every later pin to a JS-derived
   * position (repeated-click takeover, settle) would paint as a visible
   * forward lurch.
   */
  startedAt: number;
}

export interface TrackBindingApi {
  readCurrentPosition: () => number;
  getSlotSize: () => number;
  /**
   * Hand a plain easing translation to the compositor via the Web Animations
   * API. Returns `true` when the animation was started — the JS-sampled
   * `writePosition` then steps aside for the track DOM until the animation
   * finishes or is cancelled. Returns `false` when compositor motion is not
   * possible (no measured slot size, no `Element.animate`, degenerate input),
   * in which case the caller keeps the JS-driven per-frame transform write.
   */
  startCompositorMotion: (options: TrackCompositorMotionOptions) => boolean;
  /**
   * Tear down any running compositor animation and pin the track to a known
   * transform. Pass the authoritative `position` when it is known (the common
   * case: the reducer/handoff origin); omit it only to freeze at the
   * currently-painted transform, which costs a `getComputedStyle` read.
   */
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

      // While a compositor animation owns the track, the JS sampler still
      // publishes its authoritative timeline to non-track subscribers, but its
      // per-frame transform write here would fight the WAAPI keyframes. Bail
      // before resolving the transform so a composited frame costs no string
      // build. A `geometry` write (render-window / resize sync) is allowed
      // through because it must re-baseline the transform; that path cancels
      // the compositor animation first (see `syncGeometry`).
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

      // Freeze the track at a known transform before cancelling: an explicit
      // `position` (the usual case) is resolved through the same math the JS
      // path uses; only when it is omitted do we pay a `getComputedStyle`
      // read to capture whatever the compositor curve was showing.
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
    },
    [resolveTransform, trackRef],
  );

  const startCompositorMotion = useCallback(
    ({ from, to, duration, easing, startedAt }: TrackCompositorMotionOptions): boolean => {
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

      // Replace any in-flight compositor animation, anchored at the new origin.
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

      // Paint the origin synchronously so the first compositor frame and the
      // JS sampler's `from` plateau agree, then start the keyframe animation.
      track.style.transform = fromTransform;
      lastTransformRef.current = fromTransform;

      let animation: Animation;
      try {
        animation = track.animate(
          [{ transform: fromTransform }, { transform: toTransform }],
          { duration, easing, fill: "both" },
        );
      } catch {
        // Some restrictive engines expose `animate` but throw on use.
        return false;
      }

      // Pin the animation to the segment's own clock. A fresh animation is
      // otherwise play-pending until the browser commits it (a frame or more
      // later under commit/raster load), which would leave the whole run
      // phase-shifted behind the JS sampler; with an explicit `startTime` the
      // compositor and the controller trace the same curve at the same
      // instants, so a mid-flight handoff pin lands exactly where the track
      // is already painted. `document.timeline` times share the
      // `performance.now()` origin the runner stamps `startedAt` with.
      try {
        animation.startTime = startedAt;
      } catch {
        // Engines that reject an explicit startTime keep the default
        // play-pending start — the pre-fix behaviour, still correct.
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
    [cancelCompositorMotion, trackRef],
  );

  const syncGeometry = useCallback(
    (width?: number) => {
      // A geometry change re-bases the transform math (slot size /
      // render-window-start), so any compositor animation keyed off the old
      // baseline must be torn down first and the track re-pinned to the live
      // visual position.
      cancelCompositorMotion(visualPosition.getSnapshot().position);
      measure(width);
      writePosition(visualPosition.getSnapshot().position, "geometry");
    },
    [cancelCompositorMotion, measure, visualPosition, writePosition],
  );

  // The track is animated solely by the JS motion controller writing
  // `transform` per RAF tick — a CSS `transition` would double-animate and
  // fight the controller. Disable it once on mount; the track element is
  // stable for the carousel's lifetime, so it never needs re-applying.
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
        (frame) => writePosition(frame.position),
        { emitCurrent: true },
      ),
    [visualPosition, writePosition],
  );

  // Cold read for a new segment's origin (gesture press, navigation click):
  // return where the track is *actually painted*.
  //  - JS-driven track: the last emitted frame IS what was painted, so use it
  //    (a fresh controller sample would be ahead of the paint — the original
  //    §4 rationale for preferring the emitted frame here).
  //  - Composited track: the compositor has painted ahead of the last emitted
  //    frame, so the emitted frame is stale; `sampleNow` (the curve at `now()`,
  //    reflow-free) is the closer match. Never read the DOM to recover this.
  const readCurrentPosition = useCallback(
    () =>
      compositorAnimationRef.current !== null
        ? visualPosition.sampleNow()
        : visualPosition.getSnapshot().position,
    [visualPosition],
  );

  const getSlotSize = useCallback(() => slotSizeRef.current ?? 0, []);

  // Stop a dangling compositor animation on unmount. The motion runner's own
  // teardown also cancels, but this keeps the binding self-contained: the
  // animation is tied to a track element that is about to leave the DOM.
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
