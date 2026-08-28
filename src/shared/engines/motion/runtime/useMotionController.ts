// See ../README.md
import { useEffect, useState } from "react";
import { createMotionController } from "./createMotionController";
import type { MotionController } from "./types";

// One controller per instance, built by a state initialiser (so it is never
// created twice); cleanup soft-destroys (StrictMode-safe), so a remount reuses
// it rather than swapping in a fresh one.
export function useMotionController<Strategy extends string = string>(
  initialValue = 0,
  initialStrategy: Strategy = "idle" as Strategy,
): MotionController<Strategy> {
  const [controller] = useState(() =>
    createMotionController<Strategy>(initialValue, initialStrategy),
  );

  useEffect(() => () => controller.destroy(), [controller]);

  return controller;
}
