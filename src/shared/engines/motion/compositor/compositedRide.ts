import { useRef } from "react";

import { profileProgressStops, keyframesAlongStops } from "../profile/progressCurve";
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
 * On top of the low-level `start(segment)` it offers the whole high-level
 * vocabulary a simple consumer needs, so no ride is ever assembled by hand:
 *
 *  - `flyTo({ to, cruiseSpeed })` — build the profile AND the segment
 *    internally, continuing velocity-seamlessly from the live handoff;
 *  - `dragBinding()` — the standard finger↔value glue, shaped to drop
 *    straight into the gesture library's `value` prop (matched structurally;
 *    the libraries still never import each other);
 *  - `position()` — the live value off the curve, never the DOM.
 *
 * Consumers that fan ONE value out into MANY elements (a dot strip, where
 * each element runs its own derived keyframes) are the OTHER shape: their
 * choreography is domain logic by nature, and they compose the same
 * primitives directly — `keyframesAlongStops` + `startPinnedAnimation` per
 * element. This rider deliberately does not try to cover them.
 *
 * JS fallback is built in: when the compositor cannot take the ride (no
 * WAAPI, engine throw, no element), the controller runs the segment with its
 * frame loop and the consumer's paint subscription (see `useMotionPaint`,
 * or the hook's built-in paint below) carries the pixels — `start`/`flyTo`
 * report which path was taken.
 */

/**
 * Default profile shape of a `flyTo` ride: 30% of the distance accelerating,
 * 40% decelerating, the rest cruising — a soft, generic S that reads well
 * from a standstill and into a landing alike. Override per call.
 */
export const DEFAULT_RIDE_SHARES = {
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.4,
} as const;

/** Rider-level defaults: the moving element (a React ref object) and the
 * caller's domain function. Given once, they free every `flyTo`/`start` call
 * from repeating them — and let the hook wire the paint automatically. */
export interface CompositedRideDefaults {
  element?: { current: Element | null };
  toKeyframe?: (value: number) => Keyframe;
}

export interface CompositedRideStart<Strategy extends string> {
  element?: Element | null;
  segment: ProfileSegment<Strategy>;
  /** The caller's domain: the style of `value`. Property names are style
   * properties (`transform`, `opacity`, …) — the same shape WAAPI keyframes
   * use, so one function serves the keyframes AND the pins. */
  toKeyframe?: (value: number) => Keyframe;
  /** Forwarded to the controller — fires when the segment settles. */
  onSettle?: (sample: MotionSample<Strategy>) => void;
}

/** One high-level ride: everything beyond `to` and the cruise is optional
 * and defaults to the live handoff / the rider defaults. */
export interface CompositedRideFlight<Strategy extends string> {
  to: number;
  /** Peak speed of the ride, units per ms. */
  cruiseSpeed: number;
  /** Defaults to the live handoff position — a mid-flight call retargets. */
  from?: number;
  /** Defaults to the handoff velocity aligned with the travel (`alignSpeed`)
   * — velocity-continuous pickup; pass explicitly for release kinetics. */
  startSpeed?: number;
  startedAt?: number;
  strategy?: Strategy;
  accelerationDistanceShare?: number;
  decelerationDistanceShare?: number;
  element?: Element | null;
  toKeyframe?: (value: number) => Keyframe;
  onSettle?: (sample: MotionSample<Strategy>) => void;
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
  /**
   * Tear the compositor animation down and hand the paint back to the
   * controller's loop, pinned at `position` (default: the live handoff
   * position — sampled from the curve on the shared clock, so it matches
   * what the compositor just painted). A no-op when nothing is composited.
   */
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

/** Write one keyframe's style properties directly onto the element — the pin
 * used at origin, finish and cancel, so the painted style and the animation
 * endpoints can never disagree about what a `value` looks like. */
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
  defaults?: CompositedRideDefaults,
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
    element = defaults?.element?.current ?? null,
    segment,
    toKeyframe = defaults?.toKeyframe,
    onSettle,
  }: CompositedRideStart<Strategy>): boolean => {
    // Replace any current ride, anchored at the new segment's origin.
    cancel(segment.from);

    let composited = false;
    if (element && toKeyframe) {
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
    // Catch a flying value at its live position: cancel pins the element
    // there and the drag picks it up seamlessly.
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

/**
 * React ownership of a {@link CompositedRide}: one rider per controller
 * identity, no per-render allocation. When `defaults` carry the element and
 * the domain function, the hook ALSO wires the paint subscription — the
 * consumer then writes no `useMotionPaint` of its own: drags, JS-fallback
 * frames and settle emits all paint through the same keyframe function the
 * rides use. `defaults.toKeyframe` is read through a ref, so an inline
 * function never re-wires anything.
 */
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
          // Presence-aware and latest-read: absent stays absent (the JS
          // path), present reads THROUGH the ref on every call.
          return defaultsRef.current?.toKeyframe
            ? (value: number) => defaultsRef.current!.toKeyframe!(value)
            : undefined;
        },
      } as CompositedRideDefaults),
    };
  }

  useMotionPaint(controller, ({ value }) => {
    const element = defaultsRef.current?.element?.current;
    const toKeyframe = defaultsRef.current?.toKeyframe;
    if (element && toKeyframe) applyKeyframe(element, toKeyframe(value));
  });

  return ref.current.ride;
}
