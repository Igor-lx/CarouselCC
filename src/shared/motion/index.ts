/**
 * The motion-controller engine — one self-sufficient facade. Everything a
 * consumer needs to animate a numeric value comes from here: the factory,
 * the React ownership hook, the motion clock, and the full type surface.
 * See README.md in this folder for the standalone contract.
 */
export { createMotionController } from "./createMotionController";
export { useMotionController } from "./useMotionController";
export { motionNow } from "./clock";
export type {
  MotionController,
  MotionSample,
  MotionSampleData,
  MotionHandoff,
  MotionPhase,
  MotionSegmentBase,
  MotionSegmentSampler,
  MotionStartOptions,
  MotionSetOptions,
  MotionSnapOptions,
  MotionSubscriber,
  MotionCompletionMode,
} from "./types";
