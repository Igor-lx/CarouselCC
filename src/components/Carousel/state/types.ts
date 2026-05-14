import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";

export type MoveReason = "click" | "gesture" | "autoplay" | "unknown";

export type MotionPhase =
  | "idle"
  | "step-normal"
  | "step-jump"
  | "step-snap"
  | "step-instant"
  | "dragging";

export interface GestureRelease {
  pointerVelocity: number;
  uiVelocity: number;
}

export const ZERO_GESTURE_RELEASE: GestureRelease = {
  pointerVelocity: 0,
  uiVelocity: 0,
};

export interface CarouselState {
  layout: CarouselLayout;
  activePageIndex: number;
  targetPageIndex: number;
  fromVirtualIndex: number;
  virtualIndex: number;
  followUpVirtualIndex: number | null;
  isRepeatedClickAdvance: boolean;
  motionPhase: MotionPhase;
  moveReason: MoveReason;
  gesture: GestureRelease;
}

interface VirtualIndexSource {
  fromVirtualIndex?: number;
}

interface StepIntentBase extends VirtualIndexSource {
  moveReason: MoveReason;
  isInstant?: boolean;
}

export interface MoveCommand extends StepIntentBase {
  type: "MOVE";
  step: number;
}

export interface GoToCommand extends StepIntentBase {
  type: "GO_TO";
  targetPageIndex: number;
}

export interface StartDragCommand extends VirtualIndexSource {
  type: "START_DRAG";
  targetPageIndex?: number;
}

export interface EndDragCommand extends VirtualIndexSource {
  type: "END_DRAG";
  isInstant?: boolean;
  targetPageIndex: number;
  targetVirtualIndex: number;
  isSnap: boolean;
  pointerReleaseVelocity: number;
  uiReleaseVelocity: number;
}

export interface MotionSettledCommand {
  type: "MOTION_SETTLED";
  /**
   * The visual position at which the motion controller actually settled.
   * Required because, between the moment a segment naturally settles in the
   * RAF tick and the moment the React reducer runs MOTION_SETTLED, the user
   * may have dispatched a click that overwrote `state.virtualIndex` with a
   * new target. The reducer must use this canonical "where the track really
   * stopped" value as the chain / idle origin — using `state.virtualIndex`
   * would race with that overwrite and snap the track to the post-click
   * target instead of continuing to animate to it.
   */
  settledPosition: number;
}

export type CarouselCommand =
  | MoveCommand
  | GoToCommand
  | StartDragCommand
  | EndDragCommand
  | MotionSettledCommand;

export interface ReducerContext {
  layout: CarouselLayout;
  config: CarouselRuntimeConfig;
  isInstantMode: boolean;
}

export type ReducerEnvelope<C extends CarouselCommand = CarouselCommand> = C & {
  context: ReducerContext;
};
