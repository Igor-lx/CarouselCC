import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";

export type MoveReason = "click" | "gesture" | "autoplay";

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
  targetPageIndex: number;
  fromVirtualIndex: number;
  virtualIndex: number;
  teleportVirtualIndex: number | null;
  isTeleportApproach: boolean;
  isRepeatedClickAdvance: boolean;
  motionPhase: MotionPhase;
  moveReason: MoveReason | null;
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
