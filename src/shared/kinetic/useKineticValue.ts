import { useCallback, useRef } from "react";

import { resolveReleaseLaunch, usePointerSwipe } from "./internal/gesture";
import {
  alignSpeed,
  applyKeyframe,
  buildProfile,
  createProfileSegment,
  useCompositedRide,
  useMotionController,
  useMotionPaint,
  type MotionSample,
} from "./internal/motion";
import { KINETIC_DEFAULTS } from "./internal/defaults";
import type { KineticConfig, UseKineticValueInput, KineticValue } from "./internal/types";

/**
 * THE blank: one draggable, flyable value painted through one element, fused
 * from the gesture and motion forks this folder carries. Everything the two
 * standalone engines leave to the consumer's rig — the drag→value binding,
 * the mid-flight catch, the release kinetics, the ride construction, the
 * compositor delivery with its JS fallback, the paint subscription — is
 * wired here once. The consumer supplies only the three things no library
 * can know: which elements (JSX), what the value LOOKS like (`keyframe`),
 * and — optionally — where a release should land (`resolveTarget`).
 *
 * Inertia is entirely behind the curtain: the embedded gesture engine
 * measures the gesture's kinetics during the drag (pause-protected launch
 * velocity among them), and this hook turns them into the ride — a
 * momentum glide by default, a custom policy when given.
 */
export function useKineticValue({
  keyframe,
  initialValue = 0,
  enabled = true,
  config,
  resolveTarget,
  onSettle,
}: UseKineticValueInput): KineticValue {
  const cfgRef = useRef<KineticConfig>(KINETIC_DEFAULTS);
  cfgRef.current = { ...KINETIC_DEFAULTS, ...config };
  const keyframeRef = useRef(keyframe);
  keyframeRef.current = keyframe;
  const resolveTargetRef = useRef(resolveTarget);
  resolveTargetRef.current = resolveTarget;
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  const controller = useMotionController(initialValue);
  const ride = useCompositedRide(controller);
  const elementRef = useRef<HTMLElement | null>(null);

  // The one paint path: drag writes, JS-fallback frames and settle emits all
  // land here; behind a composited ride it costs only the initial and the
  // settled sample (passive mode).
  useMotionPaint(controller, ({ value }) => {
    const element = elementRef.current;
    if (element) applyKeyframe(element, keyframeRef.current(value));
  });

  const settle = useCallback(
    (sample: MotionSample) => onSettleRef.current?.(sample.value),
    [],
  );

  /** Build and start one ride; every path (glide, flyTo) funnels through. */
  const rideTo = useCallback(
    (
      from: number,
      to: number,
      startSpeed: number,
      peakSpeed: number,
      startedAt?: number,
    ) => {
      const cfg = cfgRef.current;
      ride.start({
        element: elementRef.current,
        segment: createProfileSegment({
          strategy: "kinetic",
          from,
          to,
          profile: buildProfile({
            from,
            to,
            startSpeed,
            peakSpeed,
            endSpeed: 0,
            accelerationDistanceShare: cfg.accelerationDistanceShare,
            decelerationDistanceShare: cfg.decelerationDistanceShare,
          }),
          startedAt,
        }),
        toKeyframe: (value) => keyframeRef.current(value),
        onSettle: settle,
      });
    },
    [ride, settle],
  );

  const flyTo = useCallback(
    (to: number) => {
      const handoff = controller.captureHandoff();
      rideTo(
        handoff.position,
        to,
        alignSpeed(handoff.velocity, to - handoff.position),
        cfgRef.current.cruiseSpeed,
        handoff.timestamp,
      );
    },
    [controller, rideTo],
  );

  const stop = useCallback(() => {
    const handoff = controller.captureHandoff();
    ride.cancel(handoff.position);
    controller.set(handoff.position);
  }, [controller, ride]);

  const { hostProps } = usePointerSwipe({
    enabled,
    config: config?.swipe,
    // The finger owns the value 1:1: catch a flying value inside read()
    // (cancel pins the element at the live position and the drag picks it
    // up), write every move straight into the controller.
    value: {
      read: () => {
        const handoff = controller.captureHandoff();
        ride.cancel(handoff.position);
        return handoff.position;
      },
      write: (value) => controller.set(value),
    },
    onRelease: ({ direction, uiOffset, launchVelocity }) => {
      const handoff = controller.captureHandoff();
      const from = handoff.position;
      const cfg = cfgRef.current;

      const custom = resolveTargetRef.current;
      const to = custom
        ? custom({ from, direction, launchVelocity, uiOffset })
        : Math.abs(launchVelocity) < cfg.minGlideSpeed
          ? null
          : from + launchVelocity * cfg.glideMomentumMs;

      if (to === null || to === from) {
        // Rest where dropped — still a settle, so onSettle stays the single
        // "the value came to rest" signal for every path. Immediate: nothing
        // animates, so the rest IS the release moment.
        controller.snap(from, { onComplete: settle, completion: "immediate" });
        return;
      }

      // Continuity launch: start at the speed the eye saw at lift-off,
      // accelerate to the intent cruise — a fast flick collapses the ramp.
      const launch = resolveReleaseLaunch({
        distance: to - from,
        visualVelocity: launchVelocity,
        handoffVelocity: 0,
        intentSpeed: cfg.cruiseSpeed,
      });
      rideTo(from, to, launch.startSpeed, launch.cruiseSpeed, handoff.timestamp);
    },
  });

  const ref = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  const value = useCallback(
    () => controller.captureHandoff().position,
    [controller],
  );

  return { hostProps, ref, flyTo, stop, value, controller };
}
