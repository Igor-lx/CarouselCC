import type { CarouselSegment, EasingSegment } from "./types";

/**
 * A track segment can be handed to WAAPI when its whole visual trajectory is a
 * single CSS timing function between two transforms. Profile-authored motion
 * keeps the JS path because it carries velocity zones or teleport semantics.
 */
export const canUseCompositorTrackMotion = (
  segment: CarouselSegment,
): segment is EasingSegment =>
  segment.strategy === "easing" || segment.strategy === "gesture-easing";
