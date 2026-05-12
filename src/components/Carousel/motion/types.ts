import type { MotionProfile } from "./profile";

export type CarouselMotionStrategy =
  | "easing"
  | "gesture-easing"
  | "gesture"
  | "repeated"
  | "repeated-follow-up"
  | "handoff"
  | "idle";

export type CarouselMotionIntent =
  | "instant"
  | "snap"
  | "jump"
  | "click-step"
  | "repeated-click"
  | "autoplay-step"
  | "gesture-release"
  | "unknown-step";

export interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SegmentBase {
  strategy: CarouselMotionStrategy;
  from: number;
  to: number;
  duration: number;
  startedAt: number;
}

export interface EasingSegment extends SegmentBase {
  strategy: "easing" | "gesture-easing";
  easing: CubicBezier;
}

export interface ProfileSegment extends SegmentBase {
  strategy: "gesture" | "repeated" | "repeated-follow-up" | "handoff";
  profile: MotionProfile;
}

export type CarouselSegment = EasingSegment | ProfileSegment;

export interface MotionStart {
  position: number;
  velocity: number;
  strategy: CarouselMotionStrategy;
}
