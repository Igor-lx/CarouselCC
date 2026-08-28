// See docs/architecture/motion.md
import type { ProfileSegment } from "../../../../shared";

/** What initiated the segment (see motion.md for the full mapping). */
export type CarouselMotionStrategy =
  "step" | "gesture" | "repeated" | "jump" | "idle";

export type CarouselMotionIntent =
  | "instant"
  | "snap"
  | "jump"
  | "teleport-preflight"
  | "teleport-approach"
  | "click-step"
  | "repeated-click"
  | "autoplay-step"
  | "gesture-release"
  | "unknown-step";

export type CarouselSegment = ProfileSegment<
  Exclude<CarouselMotionStrategy, "idle">
>;

export interface MotionStart {
  position: number;
  velocity: number;
  strategy: CarouselMotionStrategy;
}
