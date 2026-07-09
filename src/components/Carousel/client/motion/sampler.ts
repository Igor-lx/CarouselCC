import type { MotionSampleData } from "../../../../shared";
import { sampleMotionProfile } from "./profile";
import type { CarouselMotionStrategy, CarouselSegment } from "./types";

export function sampleCarouselSegment(
  segment: CarouselSegment,
  timestamp: number,
): MotionSampleData<CarouselMotionStrategy> {
  const elapsed = Math.max(0, timestamp - segment.startedAt);
  const progress = segment.duration > 0 ? Math.min(1, elapsed / segment.duration) : 1;
  const distance = segment.to - segment.from;

  if (progress >= 1) {
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

  const sampled = sampleMotionProfile(segment.profile, elapsed, Math.abs(distance));
  return {
    progress,
    value: segment.from + distance * sampled.distanceProgress,
    velocity: Math.sign(distance) * sampled.speed,
    target: segment.to,
    strategy: segment.strategy,
  };
}
