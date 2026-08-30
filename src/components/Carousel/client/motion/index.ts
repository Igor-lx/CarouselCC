export { useCarouselMotionExecution } from "./useCarouselMotionExecution";
export { createMotionPlanChannel } from "./planChannel";
export type {
  CarouselMotionPlan,
  MotionPlanChannel,
  MotionPlanDirection,
  MotionPlanSource,
  WaapiMotionPlan,
} from "./planChannel";
// Re-exported from the shared motion library so carousel modules keep one
// import root for motion concerns. Only what the modules actually take: the
// barrel is a door, not a shop window.
export {
  keyframesAlongStops,
  positionAtNow,
  startPinnedAnimation,
} from "../../../../shared";
export type { InFlightSpan } from "../../../../shared";
export type {
  CarouselMotionStrategy,
  CarouselMotionIntent,
  CarouselSegment,
  MotionStart,
} from "./types";
