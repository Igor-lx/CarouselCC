import { useRef } from "react";

import { profileProgressStops, keyframesAlongStops } from "../profile/progressCurve";
import type { ProfileSegment } from "../profile/profileSegment";
import { sampleProfileSegment } from "../profile/profileSegment";
import type { MotionController, MotionSample } from "../runtime/types";
import { startPinnedAnimation } from "./pinnedAnimation";

// Compositor path for ONE controller painted through ONE element: stops →
// keyframes → pinned animation, controller runs the same segment passively. JS
// fallback built in. (Fork trims flyTo/dragBinding.) See shared/motion/README.md.

export interface CompositedRideStart<Strategy extends string> {
  element: Element | null;
  segment: ProfileSegment<Strategy>;
  /** `value` → a style-property keyframe; one fn serves keyframes and pins. */
  toKeyframe: (value: number) => Keyframe;
  /** Forwarded to the controller — fires when the segment settles. */
  onSettle?: ((sample: MotionSample<Strategy>) => void) | undefined;
}

export interface CompositedRide<Strategy extends string> {
  /** Start (or replace) a ride. Returns `true` when the compositor took it,
   * `false` when the controller's JS loop is painting instead. */
  start: (options: CompositedRideStart<Strategy>) => boolean;
  /** Tear the animation down, hand paint back pinned at `position` (default:
   * the live handoff). No-op when nothing is composited. */
  cancel: (position?: number) => void;
  /** A compositor animation currently owns the paint. */
  isComposited: () => boolean;
}

const KEYFRAME_META = new Set(["offset", "easing", "composite"]);

/** Write a keyframe's style props onto the element (the pin at origin/finish/cancel). */
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
    // Pin BEFORE cancelling — cancel drops the fill, else a 1-frame flash back.
    applyKeyframe(ridden.element, ridden.toKeyframe(pin));
    drop();
    try {
      active.cancel();
    } catch {
      // already gone
    }
    controller.wake(); // passive controller has no loop → wake or it freezes
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
          // Pin the exact destination style, then drop (no one-frame gap).
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

// One rider per controller identity; holds no timers, only the animation handle.
// See shared/motion/README.md.
export function useCompositedRide<Strategy extends string>(
  controller: MotionController<Strategy>,
): CompositedRide<Strategy> {
  const ref = useRef<{ controller: MotionController<Strategy>; ride: CompositedRide<Strategy> } | null>(null);
  if (!ref.current || ref.current.controller !== controller) {
    ref.current = { controller, ride: createCompositedRide(controller) };
  }
  return ref.current.ride;
}
