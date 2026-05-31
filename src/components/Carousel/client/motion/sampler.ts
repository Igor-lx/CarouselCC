import type { MotionSampleData } from "../../../../shared";
import { sampleBezier } from "./bezier";
import { sampleMotionProfile } from "./profile";
import type {
  CarouselMotionStrategy,
  CarouselSegment,
  EasingSegment,
} from "./types";

const isEasingSegment = (segment: CarouselSegment): segment is EasingSegment =>
  segment.strategy === "easing" || segment.strategy === "gesture-easing";

export function sampleCarouselSegment(
  segment: CarouselSegment,
  timestamp: number,
): MotionSampleData<CarouselMotionStrategy> {
  const elapsed = Math.max(0, timestamp - segment.startedAt);
  const progress = segment.duration > 0 ? Math.min(1, elapsed / segment.duration) : 1;
  const distance = segment.to - segment.from;

  if (progress >= 1) {
    if (isEasingSegment(segment)) {
      const { slope } = sampleBezier(segment.easing, 1);
      return {
        progress,
        value: segment.to,
        velocity: segment.duration > 0 ? (distance / segment.duration) * slope : 0,
        target: segment.to,
        strategy: segment.strategy,
      };
    }
    const sampled = sampleMotionProfile(
      segment.profile,
      segment.profile.duration,
      Math.abs(distance),
    );
    return {
      progress,
      value: segment.to,
      velocity: Math.sign(distance) * sampled.speed,
      target: segment.to,
      strategy: segment.strategy,
    };
  }

  if (isEasingSegment(segment)) {
    const eased = sampleBezier(segment.easing, progress);
    return {
      progress,
      value: segment.from + distance * eased.progress,
      velocity: segment.duration > 0 ? (distance / segment.duration) * eased.slope : 0,
      target: segment.to,
      strategy: segment.strategy,
    };
  }

  const sampled = sampleMotionProfile(segment.profile, elapsed, Math.abs(distance));
  return {
    progress,
    value: segment.from + distance * sampled.distanceProgress,
    velocity: Math.sign(distance) * sampled.speed,
    target: segment.to,
    strategy: segment.strategy,
  };
}
