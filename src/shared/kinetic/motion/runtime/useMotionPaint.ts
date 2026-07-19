import { useEffect, useRef } from "react";

import type { MotionController, MotionSample } from "./types";

/**
 * The paint subscription every consumer writes as its first line: subscribe
 * for the component's lifetime, paint each emitted sample, unsubscribe on
 * unmount. `paint` is ref-wrapped, so an inline closure never causes a
 * resubscribe churn — the subscription is tied to the CONTROLLER's identity
 * alone.
 *
 * The initial sample is emitted synchronously on subscribe (the controller's
 * `emitCurrent` default), so the element is painted at its resting value
 * before the first frame — no unstyled flash.
 *
 * Note the passive-mode economics this inherits: while a segment is
 * composited (`isPassive`), the controller emits only the initial and the
 * settled sample — this callback is NOT a per-frame cost behind a compositor
 * ride, and never fights the animation for the styles in between.
 */
export function useMotionPaint<Strategy extends string = string>(
  controller: MotionController<Strategy>,
  paint: (sample: MotionSample<Strategy>) => void,
): void {
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(
    () => controller.subscribe((sample) => paintRef.current(sample)),
    [controller],
  );
}
