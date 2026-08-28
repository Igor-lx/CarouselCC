// See docs/architecture/geometry.md
import { useCallback, useEffect, useRef, type RefObject } from "react";

import { trackCssTransform, trackPixelTransform } from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";
import {
  keyframesAlongStops,
  startPinnedAnimation,
  type MotionPlanSource,
} from "../motion";
import { isDroppedFallbackFrame, type VisualPositionSource } from "../visual-position";
import type { SlotSizeSource } from "./useSlotSizeSource";

interface UseTrackBindingInput {
  trackRef: RefObject<HTMLDivElement | null>;
  layoutOrigin: number;
  visibleSlidesCount: number;
  visualPosition: VisualPositionSource;
  /** THE carousel's slot measurement — this hook owns no observer of its own. */
  slotSize: SlotSizeSource;
  /** The plan stream, read for ONE thing: whether the current per-frame ride is
   * the no-compositor fallback. The dots and the widget read the same flag from
   * the same place, which is what keeps the three of them in step. */
  motionPlan: MotionPlanSource;
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
  slotSize,
  motionPlan,
}: UseTrackBindingInput): TrackBindingApi {
  const layoutOriginRef = useRef(layoutOrigin);
  const visibleSlidesCountRef = useRef(visibleSlidesCount);
  const lastTransformRef = useRef<string | null>(null);
  const compositorAnimationRef = useRef<Animation | null>(null);
  const lastSyncedLayoutOriginRef = useRef<number | null>(null);
  /** Which per-frame ride is running: a finger (paint every frame) or the
   * no-compositor fallback (shed the shared Nth frame). */
  const isFallbackFollowRef = useRef(false);

  layoutOriginRef.current = layoutOrigin;
  visibleSlidesCountRef.current = visibleSlidesCount;

  // CONSTRAINT — key the effects below on THESE, never on the source object.
  // Both are permanently stable (the source memoises them); depending on the
  // object re-subscribes every render, and a notification emitted during a
  // commit then arrives after its own listener was torn down.
  const readSlotSize = slotSize.getSlotSize;
  const subscribeSlotSize = slotSize.subscribe;

  const resolveTransform = useCallback(
    (position: number): string => {
      const slot = readSlotSize();
      if (slot !== null) {
        return trackPixelTransform(position, layoutOriginRef.current, slot);
      }
      return trackCssTransform(
        position,
        layoutOriginRef.current,
        visibleSlidesCountRef.current,
      );
    },
    [readSlotSize],
  );

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
      const slot = readSlotSize();
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
    [cancelCompositorMotion, readSlotSize, trackRef],
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

  /** Re-pin the track onto the geometry as it stands now: any compositor ride
   * was keyframed against the OLD baseline, so it has to go. */
  const rebaseTrack = useCallback(() => {
    lastSyncedLayoutOriginRef.current = layoutOriginRef.current;

    // Read the position BEFORE teardown, else readCurrentPosition answers for
    // a JS track that never painted these frames.
    const position = readCurrentPosition();
    cancelCompositorMotion(position);
    writePosition(position, "geometry");
  }, [cancelCompositorMotion, readCurrentPosition, writePosition]);

  /** The lane origin the transform is measured from may have moved. Guarded,
   * because the common case — a settle-time render-window shift that keeps the
   * same origin — must stay free. */
  const rebaseForLayoutOrigin = useCallback(() => {
    if (lastSyncedLayoutOriginRef.current === layoutOriginRef.current) return;
    rebaseTrack();
  }, [rebaseTrack]);

  // Disable CSS transition once: it would double-animate against the per-tick
  // JS transform write. The track element is stable for the carousel's life.
  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    if (track) track.style.transition = "none";
  }, [trackRef]);

  useIsomorphicLayoutEffect(() => {
    rebaseForLayoutOrigin();
  }, [layoutOrigin, rebaseForLayoutOrigin, visibleSlidesCount]);

  // The slot moved (resize, rotation, slot-count change): the compositor's
  // keyframes were built in the OLD pixel scale. Subscribed ONCE — see the note
  // on `subscribeSlotSize` above.
  useIsomorphicLayoutEffect(
    () => subscribeSlotSize(rebaseTrack),
    [rebaseTrack, subscribeSlotSize],
  );

  // Which flavour of per-frame ride is running. Judged by the PLAN, exactly as
  // the dots and the widget judge it.
  // CONSTRAINT — do not judge this by `isWaapiSupported()`: that answers a
  // different question, and the two diverge whenever the compositor declines a
  // ride for any other reason (an unmeasurable slot, an `animate()` that
  // throws). One rule, three consumers, one signal — or they desync.
  useIsomorphicLayoutEffect(
    () =>
      motionPlan.subscribe((plan) => {
        isFallbackFollowRef.current =
          plan.kind === "follow" ? plan.isFallback : false;
      }),
    [motionPlan],
  );

  // Per-frame paint (drag + no-compositor fallback). Drop the shared Nth
  // running frame so track, dots and widget shed exactly the same frames;
  // drag frames always paint.
  useIsomorphicLayoutEffect(
    () =>
      visualPosition.subscribe(
        (frame) => {
          if (isFallbackFollowRef.current && isDroppedFallbackFrame(frame)) {
            return;
          }
          writePosition(frame.position);
        },
        { emitCurrent: true },
      ),
    [visualPosition, writePosition],
  );

  const getSlotSize = useCallback(() => readSlotSize() ?? 0, [readSlotSize]);

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
