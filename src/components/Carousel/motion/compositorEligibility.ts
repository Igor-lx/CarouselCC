import type { CarouselSegment, EasingSegment } from "./types";

export const canUseCompositorTrackMotion = (
  segment: CarouselSegment,
): segment is EasingSegment =>
  segment.strategy === "easing" || segment.strategy === "gesture-easing";
