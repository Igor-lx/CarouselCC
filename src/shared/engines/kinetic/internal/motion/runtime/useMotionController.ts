// See shared/motion/README.md
import { useEffect, useRef } from "react";
import { createMotionController } from "./createMotionController";
import type { MotionController } from "./types";

// Lazy-ref: one controller per instance; cleanup soft-destroys (StrictMode-safe),
// so a remount reuses it rather than swapping in a fresh one.
export function useMotionController<Strategy extends string = string>(
  initialValue = 0,
  initialStrategy: Strategy = "idle" as Strategy,
): MotionController<Strategy> {
  const ref = useRef<MotionController<Strategy> | null>(null);

  if (!ref.current) {
    ref.current = createMotionController(initialValue, initialStrategy);
  }

  useEffect(() => () => ref.current?.destroy(), []);

  return ref.current;
}
