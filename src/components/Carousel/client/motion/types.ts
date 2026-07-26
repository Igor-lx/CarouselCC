import type { ProfileSegment } from "../../../../shared";

/**
 * Every carousel motion is one accel/cruise/decel profile; the strategy names
 * what initiated the segment:
 * - `"step"`     — duration-authored step (click, autoplay, snap-back, non-inertial release);
 * - `"gesture"`  — inertial gesture release (speed-authored from the flick);
 * - `"repeated"` — repeated-click fast advance;
 * - `"jump"`     — every GO_TO slice (direct, preflight, approach);
 * - `"idle"`     — the resting controller sample.
 */
export type CarouselMotionStrategy =
  | "step"
  | "gesture"
  | "repeated"
  | "jump"
  | "idle";

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
