import { useRef } from "react";

import { profileProgressStops, keyframesAlongStops } from "../profile/progressCurve";
import type { ProfileSegment } from "../profile/profileSegment";
import { sampleProfileSegment } from "../profile/profileSegment";
import type { MotionController, MotionSample } from "../runtime/types";
import { startPinnedAnimation } from "./pinnedAnimation";

/**
 * The turnkey compositor path for the CANONICAL shape: one controller (one
 * number) painted through ONE element's WAAPI animation — a strip, a knob, a
 * progress bar, the tutorial circle. It bundles what such a consumer would
 * otherwise assemble by hand from this library's parts:
 *
 *   stops from the profile → keyframes in the caller's domain →
 *   `startPinnedAnimation` → controller runs the SAME segment passively
 *   (no frame loop; it stays the position SSOT for handoffs) → on finish the
 *   final style is pinned and the animation dropped → on cancel the live
 *   position is pinned and the controller's loop woken to take the paint
 *   back.
 *
 * Consumers that fan ONE value out into MANY elements (a dot strip, where
 * each element runs its own derived keyframes) are the OTHER shape: their
 * choreography is domain logic by nature, and they compose the same
 * primitives directly — `keyframesAlongStops` + `startPinnedAnimation` per
 * element. This rider deliberately does not try to cover them.
 *
 * JS fallback is built in: when the compositor cannot take the ride (no
 * WAAPI, engine throw, no element), the controller runs the segment with its
 * frame loop and the consumer's paint subscription (see `useMotionPaint`)
 * carries the pixels — `start` reports which path was taken.
 */

export interface CompositedRideStart<Strategy extends string> {
  element: Element | null;
  segment: ProfileSegment<Strategy>;
  /** The caller's domain: the style of `value`. Property names are style
   * properties (`transform`, `opacity`, …) — the same shape WAAPI keyframes
   * use, so one function serves the keyframes AND the pins. */
  toKeyframe: (value: number) => Keyframe;
  /** Forwarded to the controller — fires when the segment settles. */
  onSettle?: (sample: MotionSample<Strategy>) => void;
}

export interface CompositedRide<Strategy extends string> {
  /** Start (or replace) a ride. Returns `true` when the compositor took it,
   * `false` when the controller's JS loop is painting instead. */
  start: (options: CompositedRideStart<Strategy>) => boolean;
  /**
   * Tear the compositor animation down and hand the paint back to the
   * controller's loop, pinned at `position` (default: the live handoff
   * position — sampled from the curve on the shared clock, so it matches
   * what the compositor just painted). A no-op when nothing is composited.
   */
  cancel: (position?: number) => void;
  /** A compositor animation currently owns the paint. */
  isComposited: () => boolean;
}

const KEYFRAME_META = new Set(["offset", "easing", "composite"]);

/** Write one keyframe's style properties directly onto the element — the pin
 * used at origin, finish and cancel, so the painted style and the animation
 * endpoints can never disagree about what a `value` looks like. Exported in
 * this fork: the fused hook paints through the same function. */
export const applyKeyframe = (element: Element, keyframe: Keyframe) => {
  const style = (element as HTMLElement).style;
  if (!style) return;
  for (const [property, value] of Object.entries(keyframe)) {
    if (KEYFRAME_META.has(property) || value == null) continue;
    style[property as never] = String(value) as never;
  }
};

export const createCompositedRide = <Strategy extends string>(
  controller: MotionController<Strategy>,
): CompositedRide<Strategy> => {
  let animation: Animation | null = null;
  let ridden: { element: Element; toKeyframe: (value: number) => Keyframe } | null =
    null;

  const drop = () => {
    animation = null;
    ridden = null;
  };

  const cancel = (position?: number) => {
    if (!animation || !ridden) return;
    const active = animation;
    const pin = position ?? controller.captureHandoff().position;
    // Pin BEFORE cancelling: cancel drops the fill and the element would
    // flash back to its pre-ride style for a frame.
    applyKeyframe(ridden.element, ridden.toKeyframe(pin));
    drop();
    try {
      active.cancel();
    } catch {
      // already gone
    }
    // The compositor was this segment's paint owner and the controller is
    // passive; wake its loop or the value freezes here and teleports at the
    // settle. Harmlessly superseded when a new segment starts right after.
    controller.wake();
  };

  const start = ({
    element,
    segment,
    toKeyframe,
    onSettle,
  }: CompositedRideStart<Strategy>): boolean => {
    // Replace any current ride, anchored at the new segment's origin.
    cancel(segment.from);

    let composited = false;
    if (element) {
      const stops = profileProgressStops(segment.profile, segment.to - segment.from);
      const keyframes = keyframesAlongStops(
        segment.from,
        segment.to,
        stops,
        toKeyframe,
      ) as Keyframe[];

      // Paint the origin synchronously so the first compositor frame and the
      // segment's `from` plateau agree.
      applyKeyframe(element, toKeyframe(segment.from));

      const started = startPinnedAnimation(element, keyframes, {
        duration: segment.duration,
        startedAt: segment.startedAt,
      });
      if (started) {
        animation = started;
        ridden = { element, toKeyframe };
        started.onfinish = () => {
          if (animation !== started) return;
          // Park the exact destination style, then drop the animation — the
          // element keeps the pinned style, no one-frame gap.
          applyKeyframe(element, toKeyframe(segment.to));
          drop();
          try {
            started.cancel();
          } catch {
            // already gone
          }
        };
        started.oncancel = () => {
          if (animation === started) drop();
        };
        composited = true;
      }
    }

    controller.start({
      segment,
      sampler: sampleProfileSegment,
      onComplete: onSettle,
      isPassive: composited,
    });
    return composited;
  };

  return { start, cancel, isComposited: () => animation !== null };
};

/**
 * React ownership of a {@link CompositedRide}: one rider per controller
 * identity, no per-render allocation. Cleanup is the consumer's segment
 * teardown (`controller.destroy()` via `useMotionController`) — the rider
 * itself holds no timers, only the animation handle its `cancel` releases.
 */
export function useCompositedRide<Strategy extends string>(
  controller: MotionController<Strategy>,
): CompositedRide<Strategy> {
  const ref = useRef<{ controller: MotionController<Strategy>; ride: CompositedRide<Strategy> } | null>(null);
  if (!ref.current || ref.current.controller !== controller) {
    ref.current = { controller, ride: createCompositedRide(controller) };
  }
  return ref.current.ride;
}
