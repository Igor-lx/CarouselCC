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
  targetPageIndex: number;
  fromVirtualIndex: number;
  virtualIndex: number;
  /**
   * Final virtual position of a far GO_TO after its bounded preflight. While
   * set, `virtualIndex` is the bounded preflight landing and `targetPageIndex`
   * already names the final logical destination. Kept bounded on purpose: the
   * render window is built from `virtualIndex`, so the far target must not
   * leak into it before the teleport. `null` for every non-teleport step.
   */
  teleportVirtualIndex: number | null;
  /**
   * True for the post-teleport approach segment of a far GO_TO. Selects the
   * approach slice of the GO_TO profile: it enters at cruise speed and decays
   * to rest at the final target.
   */
  isTeleportApproach: boolean;
  /**
   * True when this segment was started by a click that arrived while the
   * carousel was already moving in the same direction. It selects the fast
   * acceleration profile instead of plain bezier easing - the segment still
   * drives straight to the page boundary and decays to zero speed.
   */
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
   * The visual position where the controller actually settled.
   *
   * Between the RAF tick that settles a segment and the reducer turn that
   * handles MOTION_SETTLED, another click may already have replaced
   * `state.virtualIndex` with a later target. The reducer needs the settled
   * position to distinguish "the current target finished" from "an older
   * target finished while a newer one is already pending".
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
