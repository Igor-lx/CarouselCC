import {
  alignedVirtualIndex,
  clamp,
  normalizePageIndex,
  pageStart,
} from "../domain";
import { REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES } from "../config";
import type { MotionSettings } from "../config";
import { resolveGoToPlan } from "../motion/timing";
import type {
  CarouselState,
  GoToCommand,
  MoveCommand,
  MotionPhase,
} from "./types";

const repeatedClickStep = (step: number): number =>
  Math.sign(step) * REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES;

/**
 * Picks the "from" page for the next step.
 * - Default: the cursor is `state.targetPageIndex` (the pending destination
 *   while queued, the settled page while idle); the origin is only the lane
 *   reference for a fresh handoff.
 * - Same-direction repeat click: the cursor is the LIVE visual page, so a
 *   rapid click resolves one page ahead of where the deck is now and never
 *   accumulates further ahead than the user sees.
 */
const stepOrigin = (
  state: CarouselState,
  fromVirtualIndex: number,
  step: number,
  isSameDirectionRepeat: boolean,
) => {
  const stepSize = state.layout.visibleSlidesCount;
  const isQueued = state.layout.canSlide && state.motionPhase !== "idle";

  let currentPageIndex: number;
  let laneReference: number;
  if (isSameDirectionRepeat) {
    const direction = Math.sign(step);
    const visualPage =
      direction > 0
        ? Math.floor(fromVirtualIndex / stepSize)
        : Math.ceil(fromVirtualIndex / stepSize);
    currentPageIndex = state.layout.isFinite
      ? clamp(visualPage, 0, state.layout.pageCount - 1)
      : normalizePageIndex(visualPage, state.layout.pageCount);
    laneReference = fromVirtualIndex;
  } else {
    currentPageIndex = state.targetPageIndex;
    laneReference = isQueued ? state.virtualIndex : fromVirtualIndex;
  }

  const currentVirtualIndex = state.layout.isFinite
    ? pageStart(currentPageIndex, stepSize)
    : alignedVirtualIndex(currentPageIndex, laneReference, state.layout);

  return { currentPageIndex, currentVirtualIndex };
};

interface StepResolution {
  nextFromVirtualIndex: number;
  nextTargetPageIndex: number;
  nextVirtualIndex: number;
  /**
   * Final virtual position of a far GO_TO, or `null` for a step that does not
   * teleport. When set, `nextVirtualIndex` is the bounded preflight landing.
   */
  nextTeleportVirtualIndex: number | null;
  phase: MotionPhase;
}

const stepPhase = (
  command: MoveCommand | GoToCommand,
  isInstantMode: boolean,
): MotionPhase => {
  if (command.isInstant || isInstantMode) return "step-instant";
  return command.type === "GO_TO" ? "step-jump" : "step-normal";
};

export const resolveStepTransition = (
  state: CarouselState,
  command: MoveCommand | GoToCommand,
  isInstantMode: boolean,
  motion: MotionSettings,
  isSameDirectionRepeat: boolean = false,
): StepResolution => {
  const { layout } = state;
  const stepSize = layout.visibleSlidesCount;
  const nextFromVirtualIndex = command.fromVirtualIndex ?? state.virtualIndex;
  const step = command.type === "MOVE" ? command.step : 0;
  // A same-direction repeat click lands `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`
  // ahead of the live visual page (see `stepOrigin`), so rapid clicks extend
  // the run instead of bunching up on the first segment.
  const effectiveMoveStep = isSameDirectionRepeat
    ? repeatedClickStep(step)
    : step;
  const { currentPageIndex, currentVirtualIndex } = stepOrigin(
    state,
    nextFromVirtualIndex,
    step,
    isSameDirectionRepeat,
  );

  let nextTargetPageIndex = currentPageIndex;
  let pageDelta = 0;

  if (command.type === "MOVE") {
    const raw = currentPageIndex + effectiveMoveStep;
    nextTargetPageIndex = layout.isFinite
      ? clamp(raw, 0, layout.pageCount - 1)
      : normalizePageIndex(raw, layout.pageCount);
    pageDelta = layout.isFinite
      ? nextTargetPageIndex - currentPageIndex
      : effectiveMoveStep;
  } else {
    const resolved = layout.isFinite
      ? clamp(command.targetPageIndex, 0, layout.pageCount - 1)
      : normalizePageIndex(command.targetPageIndex, layout.pageCount);
    // Dot-scale direction, NOT the shortest cyclic path: the plain difference
    // rides the deck the way the user moved on the pagination strip (a dot to
    // the left always travels left). A cyclic shortcut would sometimes ride
    // against the strip and saves nothing — a far span is already bounded by
    // the teleport plan below. Cyclic wrap stays the business of ±1 steps.
    pageDelta = resolved - currentPageIndex;
    nextTargetPageIndex = resolved;
  }

  // The full visual destination, before any teleport bounding is applied.
  const canonicalVirtualIndex = layout.isFinite
    ? pageStart(nextTargetPageIndex, stepSize)
    : currentVirtualIndex + pageDelta * stepSize;

  // A long GO_TO animates a bounded preflight, teleports the middle, then
  // animates a fixed approach. `virtualIndex` stays at the preflight landing on
  // purpose — the render window is built from it, so it must not name the far
  // target.
  const goToPlan =
    command.type === "GO_TO" && !command.isInstant && !isInstantMode
      ? resolveGoToPlan(Math.abs(pageDelta), stepSize, motion)
      : null;
  const isTeleport = goToPlan !== null && goToPlan.isTeleport;
  const nextVirtualIndex =
    isTeleport && goToPlan
      ? currentVirtualIndex + Math.sign(pageDelta) * goToPlan.leadDistance
      : canonicalVirtualIndex;

  return {
    nextFromVirtualIndex,
    nextTargetPageIndex,
    nextVirtualIndex,
    nextTeleportVirtualIndex: isTeleport ? canonicalVirtualIndex : null,
    phase: stepPhase(command, isInstantMode),
  };
};

/** A MOVE click arriving while the deck already animates the same direction.
 * It only selects the fast motion profile — the destination model is unchanged. */
export const isSameDirectionRepeat = (
  state: CarouselState,
  step: number,
): boolean => {
  const direction = Math.sign(step);
  if (direction === 0) return false;
  if (state.motionPhase === "idle" || state.motionPhase === "dragging") {
    return false;
  }
  const currentDirection = Math.sign(state.virtualIndex - state.fromVirtualIndex);
  return currentDirection !== 0 && currentDirection === direction;
};

export const hasReachedDragTarget = (
  originVirtualIndex: number,
  targetVirtualIndex: number,
  epsilon: number,
) => Math.abs(originVirtualIndex - targetVirtualIndex) < epsilon;
