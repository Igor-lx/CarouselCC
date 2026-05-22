import { useEffect, useRef } from "react";
import { createMotionController } from "./createMotionController";
import type { MotionController } from "./types";

/**
 * Owns one `MotionController` for the lifetime of the host component.
 *
 * The lazy-ref + null-on-cleanup pattern is deliberate, and is *not* a
 * `useState` initializer:
 *  - `useRef(null)` + a guarded assignment creates the controller exactly
 *    once per mount with no per-render allocation;
 *  - the cleanup `destroy()`s the controller AND nulls the ref, so a
 *    Strict Mode unmount/remount (or any genuine remount) re-creates a fresh
 *    controller on the next render instead of handing back a destroyed one.
 *
 * A `useState(() => create())` initializer cannot do the second part — it
 * runs once and would keep returning the destroyed instance after the Strict
 * Mode cleanup. Keep this shape.
 */
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
