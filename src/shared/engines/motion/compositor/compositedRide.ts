import { useRef } from "react";

import {
  profileProgressStops,
  keyframesAlongStops,
} from "../profile/progressCurve";
import { buildProfile } from "../profile/profile";
import type { ProfileSegment } from "../profile/profileSegment";
import {
  alignSpeed,
  createProfileSegment,
  sampleProfileSegment,
} from "../profile/profileSegment";
import type { MotionController, MotionSample } from "../runtime/types";
import { useMotionPaint } from "../runtime/useMotionPaint";
import { startPinnedAnimation } from "./pinnedAnimation";

// The turnkey compositor path for ONE controller painted through ONE element
// (strip, knob, progress bar): stops → keyframes → pinned animation, controller
// runs the same segment passively. Fan-out-to-many is the other shape (compose
// the primitives directly). JS fallback built in. See ../README.md.

/** Default `flyTo` ride shape (accel / decel distance shares); override per call. */
export const DEFAULT_RIDE_SHARES = {
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.4,
} as const;

/** Rider-level defaults (the element + the caller's `value → keyframe`). */
export interface CompositedRideDefaults {
  element?: { current: Element | null } | undefined;
  toKeyframe?: ((value: number) => Keyframe) | undefined;
}

export interface CompositedRideStart<Strategy extends string> {
  element?: Element | null | undefined;
  segment: ProfileSegment<Strategy>;
  /** `value` → a keyframe (style props); one fn serves both keyframes and pins. */
  toKeyframe?: ((value: number) => Keyframe) | undefined;
  /** Forwarded to the controller — fires when the segment settles. */
  onSettle?: ((sample: MotionSample<Strategy>) => void) | undefined;
}

/** One high-level ride: everything beyond `to` and the cruise is optional
 * and defaults to the live handoff / the rider defaults. */
export interface CompositedRideFlight<Strategy extends string> {
  to: number;
  /** Peak speed of the ride, units per ms. */
  cruiseSpeed: number;
  /** Defaults to the live handoff position — a mid-flight call retargets. */
  from?: number | undefined;
  /** Defaults to the handoff velocity aligned with the travel (`alignSpeed`)
   * — velocity-continuous pickup; pass explicitly for release kinetics. */
  startSpeed?: number | undefined;
  startedAt?: number | undefined;
  strategy?: Strategy | undefined;
  accelerationDistanceShare?: number | undefined;
  decelerationDistanceShare?: number | undefined;
  element?: Element | null | undefined;
  toKeyframe?: ((value: number) => Keyframe) | undefined;
  onSettle?: ((sample: MotionSample<Strategy>) => void) | undefined;
}

/** The finger↔value glue in the shape the gesture library's `value` prop
 * expects — matched structurally, never by import. */
export interface RideDragBinding {
  read: () => number;
  write: (value: number) => void;
}

export interface CompositedRide<Strategy extends string> {
  /** Start (or replace) a ride from a pre-built segment. Returns `true` when
   * the compositor took it, `false` when the JS loop is painting instead. */
  start: (options: CompositedRideStart<Strategy>) => boolean;
  /** Build and start one ride — profile, segment, handoff continuation and
   * delivery all internal. The whole "button" and "release" story. */
  flyTo: (options: CompositedRideFlight<Strategy>) => boolean;
  /** Tear the compositor animation down and hand paint back, pinned at `position`
   * (default: the live handoff). No-op when nothing is composited. */
  cancel: (position?: number) => void;
  /** The standard drag glue: `read` catches any flying ride at its live
   * position, `write` feeds the finger straight into the controller. Drop
   * into `usePointerSwipe({ value: ride.dragBinding() })`. */
  dragBinding: () => RideDragBinding;
  /** The live value — sampled from the curve, never the DOM. */
  position: () => number;
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
    style[property as never] = String(value);
  }
};

export const createCompositedRide = <Strategy extends string>(
  controller: MotionController<Strategy>,
  defaults?: CompositedRideDefaults,
): CompositedRide<Strategy> => {
  let animation: Animation | null = null;
  let ridden: {
    element: Element;
    toKeyframe: (value: number) => Keyframe;
  } | null = null;

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
    element = defaults?.element?.current ?? null,
    segment,
    toKeyframe = defaults?.toKeyframe,
    onSettle,
  }: CompositedRideStart<Strategy>): boolean => {
    // Replace any current ride, anchored at the new segment's origin.
    cancel(segment.from);

    let composited = false;
    if (element && toKeyframe) {
      const stops = profileProgressStops(
        segment.profile,
        segment.to - segment.from,
      );
      const keyframes = keyframesAlongStops(
        segment.from,
        segment.to,
        stops,
        toKeyframe,
      );

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

  const flyTo = ({
    to,
    cruiseSpeed,
    from,
    startSpeed,
    startedAt,
    strategy = "ride" as Strategy,
    accelerationDistanceShare = DEFAULT_RIDE_SHARES.accelerationDistanceShare,
    decelerationDistanceShare = DEFAULT_RIDE_SHARES.decelerationDistanceShare,
    element,
    toKeyframe,
    onSettle,
  }: CompositedRideFlight<Strategy>): boolean => {
    const handoff = controller.captureHandoff();
    const origin = from ?? handoff.position;
    return start({
      element,
      toKeyframe,
      segment: createProfileSegment({
        strategy,
        from: origin,
        to,
        profile: buildProfile({
          from: origin,
          to,
          startSpeed: startSpeed ?? alignSpeed(handoff.velocity, to - origin),
          peakSpeed: cruiseSpeed,
          endSpeed: 0,
          accelerationDistanceShare,
          decelerationDistanceShare,
        }),
        startedAt: startedAt ?? handoff.timestamp,
      }),
      onSettle,
    });
  };

  const binding: RideDragBinding = {
    // Catch a flying value at its live position (drag picks it up seamlessly).
    read: () => {
      const handoff = controller.captureHandoff();
      cancel(handoff.position);
      return handoff.position;
    },
    write: (value) => controller.set(value),
  };

  return {
    start,
    flyTo,
    cancel,
    dragBinding: () => binding,
    position: () => controller.captureHandoff().position,
    isComposited: () => animation !== null,
  };
};

// One rider per controller; with defaults it also wires the paint subscription
// (drags + JS-fallback + settle) through the same keyframe fn. See ../README.md.
export function useCompositedRide<Strategy extends string>(
  controller: MotionController<Strategy>,
  defaults?: CompositedRideDefaults,
): CompositedRide<Strategy> {
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const ref = useRef<{
    controller: MotionController<Strategy>;
    ride: CompositedRide<Strategy>;
  } | null>(null);
  if (!ref.current || ref.current.controller !== controller) {
    ref.current = {
      controller,
      ride: createCompositedRide(controller, {
        get element() {
          return defaultsRef.current?.element;
        },
        get toKeyframe() {
          // Presence-aware, latest-read: absent stays absent (JS path).
          return defaultsRef.current?.toKeyframe
            ? (value: number) => defaultsRef.current!.toKeyframe!(value)
            : undefined;
        },
      }),
    };
  }

  useMotionPaint(controller, ({ value }) => {
    const element = defaultsRef.current?.element?.current;
    const toKeyframe = defaultsRef.current?.toKeyframe;
    if (element && toKeyframe) applyKeyframe(element, toKeyframe(value));
  });

  return ref.current.ride;
}
