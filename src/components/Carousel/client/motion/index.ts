export { useCarouselMotionExecution } from "./useCarouselMotionExecution";
export { createMotionPlanChannel } from "./planChannel";
export type {
  CarouselMotionPlan,
  MotionPlanChannel,
  MotionPlanDirection,
  MotionPlanSource,
  WaapiMotionPlan,
} from "./planChannel";
export { positionAtNow, keyframesAlongStops } from "./stopSampling";
export type { InFlightSpan } from "./stopSampling";
// Re-exported from the shared motion library so carousel modules keep one
// import root for motion concerns.
export { isWaapiSupported, sampleProgressStops } from "../../../../shared";
export type {
  CarouselMotionStrategy,
  CarouselMotionIntent,
  CarouselSegment,
  MotionStart,
} from "./types";
