import { useEffect, useRef } from "react";

// See shared/motion/README.md
import type { MotionController, MotionSample } from "./types";

// Paint each emitted sample; `paint` ref-wrapped so it never resubscribes.
// Inherits passive economics — no per-frame cost behind a composited ride.
export function useMotionPaint<Strategy extends string = string>(
  controller: MotionController<Strategy>,
  paint: (sample: MotionSample<Strategy>) => void,
): void {
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  useEffect(
    () => controller.subscribe((sample) => paintRef.current(sample)),
    [controller],
  );
}
