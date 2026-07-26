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
  /** Uniform time-samples of the percent-progress curve, encoded as WAAPI
   * keyframes (one transform per stop, linear between) — the curve rides the
   * grid, so any `Element.animate` engine runs it. See docs/architecture/motion.md. */
  stops: readonly number[];
  /** The segment's clock origin (`performance.now()` domain). The animation's
   * `startTime` is pinned to it so the compositor traces the SAME timeline as
   * the JS controller; without the pin a later handoff paints a forward lurch. */
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
  // The layoutOrigin the last full geometry sync was based on — lets
  // `syncGeometry` recognise a call where nothing the transform math depends
  // on has changed, and leave a live compositor ride alone.
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

      // The compositor was this segment's paint owner, and the controller may
      // be running it passively (no frame loop — see MotionStartOptions.
      // isPassive). Hand the paint back to the JS loop, or the strip freezes
      // right here and teleports when the settle fires. For cancels that
      // immediately start a new segment (takeover, retarget) the wake is
      // harmlessly superseded by that segment's own start.
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

      // Replace any in-flight compositor animation, anchored at the new origin.
      cancelCompositorMotion(from);

      // One keyframe per progress stop: the temporal curve is carried by the
      // keyframe values themselves (evenly distributed offsets, default linear
      // interpolation between them), so no easing function is involved. The
      // same builder the pagination variants use — one reading of a plan's
      // stops for all three consumers (see motion/stopSampling).
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

      // Paint the origin synchronously so the first compositor frame and the
      // JS sampler's `from` plateau agree, then start the keyframe animation.
      track.style.transform = fromTransform;
      lastTransformRef.current = fromTransform;

      // The engine's delivery step owns the whole ritual: the WAAPI gate, the
      // animate() throw fallback, and the startTime pin to the segment clock
      // (see startPinnedAnimation for why the pin matters).
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

  // Cold read for a new segment's origin (gesture press, navigation click):
  // return where the track is *actually painted*.
  //  - JS-driven track: the last emitted frame IS what was painted, so use it
  //    (a fresh controller sample would be ahead of the paint).
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

  const syncGeometry = useCallback(
    (width?: number) => {
      const previousSlot = slotSizeRef.current;
      const nextSlot = measure(width);

      // Bail when nothing the transform math depends on changed: same slot,
      // same layoutOrigin. Judged through the SLOT, not raw pixels, so a
      // height-only viewport change (mobile URL bar collapsing) does not tear
      // down a healthy compositor ride.
      if (
        nextSlot !== null &&
        nextSlot === previousSlot &&
        lastSyncedLayoutOriginRef.current === layoutOriginRef.current
      ) {
        return;
      }
      lastSyncedLayoutOriginRef.current = layoutOriginRef.current;

      // A real geometry change re-bases the transform math, so any compositor
      // animation on the old baseline is torn down and the track re-pinned.
      // Read the position BEFORE the teardown — afterwards readCurrentPosition
      // answers for a JS track that never painted these frames.
      const position = readCurrentPosition();
      cancelCompositorMotion(position);
      writePosition(position, "geometry");
    },
    [cancelCompositorMotion, measure, readCurrentPosition, writePosition],
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

  // Per-frame subscriber: the paint path for drag and the legacy fallback.
  // On engines with no WAAPI, engine-driven segments are painted here frame
  // by frame — drop the shared Nth running frame (`isDroppedFallbackFrame`)
  // so the track and the widget shed exactly the same frames. Drag frames
  // are published with a non-running phase and always paint.
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
