import { useEffect, useRef } from "react";
import { createMotionController } from "./createMotionController";
import type { MotionController } from "./types";

/**
 * Owns one `MotionController` for the lifetime of the host component.
 *
 * Lazy-ref pattern: `useRef(null)` + a guarded assignment creates the
 * controller exactly once per component instance, with no per-render
 * allocation. The cleanup `destroy()`s it but does NOT null the ref —
 * `destroy()` is a *soft* reset (cancels motion, clears subscribers; the
 * instance stays usable). So a React StrictMode unmount/remount reuses the
 * same controller — re-subscribed by the re-run consumer effects — instead of
 * swapping in a fresh one. A genuine remount is a new component instance with
 * a fresh ref, so it gets its own controller naturally.
 *
 * This mirrors `useImageResourceStoreInstance`: both own a soft-disposable
 * resource under the same lifecycle contract.
 */
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
