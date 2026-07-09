export { useCarouselMotionExecution } from "./useCarouselMotionExecution";
export { createMotionPlanChannel } from "./planChannel";
export type {
  CarouselMotionPlan,
  MotionPlanChannel,
  MotionPlanDirection,
  MotionPlanSource,
  WaapiMotionPlan,
} from "./planChannel";
export { isWaapiSupported, sampleProgressStops } from "./progressCurve";
export type {
  CarouselMotionStrategy,
  CarouselMotionIntent,
  CarouselSegment,
  MotionStart,
} from "./types";
