import type { MotionProfile } from "./profile";

/**
 * Every carousel motion is one accel/cruise/decel profile — there is no
 * second segment shape and no easing-curve path. The strategy names what
 * initiated the segment:
 * - `"step"`     — duration-authored steps: click, autoplay, snap-back, and a
 *                  non-inertial gesture release;
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

export interface CarouselSegment {
  strategy: Exclude<CarouselMotionStrategy, "idle">;
  from: number;
  to: number;
  duration: number;
  startedAt: number;
  profile: MotionProfile;
}

export interface MotionStart {
  position: number;
  velocity: number;
  strategy: CarouselMotionStrategy;
}
