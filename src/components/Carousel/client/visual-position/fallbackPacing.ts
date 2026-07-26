// See docs/architecture/visual-position.md
import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../config";
import type { VisualPositionFrame } from "./types";

/** The one shared fallback frame-skip rule; pure in the frame, so all consumers
 * drop the same frames. Only `"running"` frames drop; first of a streak paints. */
export const isDroppedFallbackFrame = (frame: VisualPositionFrame): boolean =>
  FALLBACK_DROP_EVERY_NTH_FRAME > 1 &&
  frame.phase === "running" &&
  (frame.runningFrameIndex + 1) % FALLBACK_DROP_EVERY_NTH_FRAME === 0;
