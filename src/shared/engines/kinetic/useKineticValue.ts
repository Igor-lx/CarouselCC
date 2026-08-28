import { useCallback, useEffect, useMemo, useRef } from "react";

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
import type {
  KineticConfig,
  UseKineticValueInput,
  KineticValue,
} from "./internal/types";

// The facade hook: fuses the gesture + motion forks into one draggable/flyable
// value. Wires every seam the standalone engines leave to the consumer; the
// consumer supplies only keyframe (+ optional resolveTarget). See README.md.
export function useKineticValue({
  keyframe,
  initialValue = 0,
  enabled = true,
  config,
  surfaceRef,
  resolveTarget,
  onSettle,
}: UseKineticValueInput): KineticValue {
  // Merged once per config object instead of on every render.
  const resolvedConfig = useMemo<KineticConfig>(
    () => ({ ...KINETIC_DEFAULTS, ...config }),
    [config],
  );

  const cfgRef = useRef(resolvedConfig);
  const keyframeRef = useRef(keyframe);
  const resolveTargetRef = useRef(resolveTarget);
  const onSettleRef = useRef(onSettle);

  // Mirrored after the commit, never during render: every reader is a paint, a
  // settle or a pointer handler, and none of those can run before effects have
  // flushed.
  useEffect(() => {
    cfgRef.current = resolvedConfig;
    keyframeRef.current = keyframe;
    resolveTargetRef.current = resolveTarget;
    onSettleRef.current = onSettle;
  });

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
    surfaceRef,
    config: config?.swipe,
    // Finger owns the value 1:1: read() catches a flying value (cancel pins
    // the live position), write() feeds every move into the controller.
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
        // Rest where dropped — still a settle (onSettle is the one "came to
        // rest" signal); immediate, nothing animates.
        controller.snap(from, { onComplete: settle, completion: "immediate" });
        return;
      }

      // Continuity launch (see README § facade / ../gesture § Release model).
      const launch = resolveReleaseLaunch({
        distance: to - from,
        visualVelocity: launchVelocity,
        handoffVelocity: 0,
        intentSpeed: cfg.cruiseSpeed,
      });
      rideTo(
        from,
        to,
        launch.startSpeed,
        launch.cruiseSpeed,
        handoff.timestamp,
      );
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
