import { useEffect, useRef } from "react";
import { createMotionController } from "./createMotionController";
import type { MotionController } from "./types";

export function useMotionController<Strategy extends string = string>(
  initialValue = 0,
  initialStrategy: Strategy = "idle" as Strategy,
): MotionController<Strategy> {
  const ref = useRef<MotionController<Strategy> | null>(null);

  if (!ref.current) {
    ref.current = createMotionController(initialValue, initialStrategy);
  }

  useEffect(
    () => () => {
      ref.current?.destroy();
      ref.current = null;
    },
    [],
  );

  return ref.current;
}
