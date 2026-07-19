import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../config";
import type { VisualPositionFrame } from "./types";

/**
 * The ONE fallback frame-skip rule, shared by every per-frame paint consumer
 * (track binding, pagination widget). It is a pure function of the frame
 * itself: the visual-position source stamps each emit with
 * `runningFrameIndex`, so every subscriber evaluating this predicate on the
 * same frame reaches the same verdict — track and widget drop exactly the
 * same frames and stay visually locked, regardless of when each subscribed.
 *
 * Only `"running"` frames are ever dropped: resting frames (settle, idle
 * emits) and finger-drag frames (published with a non-running phase) always
 * paint. The first frame of a streak (index 0) always paints; every
 * `FALLBACK_DROP_EVERY_NTH_FRAME`-th one after it is dropped.
 */
export const isDroppedFallbackFrame = (frame: VisualPositionFrame): boolean =>
  FALLBACK_DROP_EVERY_NTH_FRAME > 1 &&
  frame.phase === "running" &&
  (frame.runningFrameIndex + 1) % FALLBACK_DROP_EVERY_NTH_FRAME === 0;
