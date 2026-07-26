// See docs/architecture/state.md
import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";

/** What initiated the current motion; `null` only in the pre-action initial
 * state, before the carousel has moved. */
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
  /** Speed the continuity launch starts from — visible strip speed protected
   * from a terminal micro-hold; `uiVelocity` stays the raw reading for
   * everything else (see `launchVelocity` on the engine's release payload). */
  launchVelocity: number;
  /** `motionNow()` at the END_DRAG dispatch — the clock the runner coasts the
   * launch position over the commit gap against (see `gesture/coast.ts`). */
  releasedAt: number;
}

export const ZERO_GESTURE_RELEASE: GestureRelease = {
  pointerVelocity: 0,
  uiVelocity: 0,
  launchVelocity: 0,
  releasedAt: 0,
};

export interface CarouselState {
  layout: CarouselLayout;
  targetPageIndex: number;
  fromVirtualIndex: number;
  virtualIndex: number;
  /**
   * Final virtual position of a far GO_TO after its bounded preflight; `null`
   * for every non-teleport step. While set, `virtualIndex` stays the preflight
   * landing so the far target never leaks into the render window built from it.
   */
  teleportVirtualIndex: number | null;
  /** Post-teleport approach segment of a far GO_TO: enters at cruise speed and
   * decays to rest at the final target. */
  isTeleportApproach: boolean;
  /** Segment started by a same-direction click during motion: selects the fast
   * acceleration profile; still drives to the page boundary and decays to rest. */
  isRepeatedClickAdvance: boolean;
  motionPhase: MotionPhase;
  /** `null` until the carousel first moves; a concrete reason thereafter. */
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
  /** Pause-protected visible speed for the continuity launch (see
   * `GestureRelease.launchVelocity`). */
  launchVelocity: number;
  /** `motionNow()` at dispatch — the start of the commit gap. */
  releasedAt: number;
}

export interface MotionSettledCommand {
  type: "MOTION_SETTLED";
  /** Where the controller actually settled — lets the reducer tell current from
   * stale when a click replaced the target mid-settle (see state.md). */
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
