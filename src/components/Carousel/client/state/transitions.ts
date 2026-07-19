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
 *
 * - Default (`isSameDirectionRepeat === false`): `state.targetPageIndex` is
 *   the reducer's logical page cursor — while motion is queued it already
 *   names the pending destination, and while idle it names the settled page.
 *   The caller-provided origin is used only as the lane reference for a
 *   fresh visual handoff.
 * - Same-direction repeat click during motion: the cursor is the *live
 *   visual page* (the page just behind the direction of travel), so a
 *   rapid-click MOVE resolves to "one page ahead of where the deck is right
 *   now". rapid clicks pick each other up while visual progresses, but they
 *   can never get the deck more than a single page ahead of what the user
 *   actually sees.
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
  // A same-direction MOVE click during in-flight motion does not accelerate
  // toward the page the deck is already heading for — it skips it. The
  // effective step lands `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES` ahead of
  // the live visual page (see `stepOrigin`), which is what makes rapid
  // clicks visibly extend the run instead of bunching up on the first
  // segment.
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
    // Dot-scale direction, NOT the shortest cyclic path: both the cursor and
    // the target live in `[0, pageCount)`, so the plain difference rides the
    // deck in the direction the user moved on the pagination strip — a dot to
    // the left always travels left. A cyclic shortcut would sometimes ride
    // AGAINST the strip (and always ride forward on the equidistant opposite
    // dot), which reads as broken; it also saves nothing visually, because a
    // far span is already bounded by the teleport plan below. Cyclic wrap
    // remains the business of ±1 steps (controls / gesture / autoplay).
    pageDelta = resolved - currentPageIndex;
    nextTargetPageIndex = resolved;
  }

  // The full visual destination, before any teleport bounding is applied.
  const canonicalVirtualIndex = layout.isFinite
    ? pageStart(nextTargetPageIndex, stepSize)
    : currentVirtualIndex + pageDelta * stepSize;

  // A GO_TO over a long span animates a bounded preflight, teleports the
  // middle, then animates a fixed approach near the final target.
  // `virtualIndex` is kept at the preflight landing on purpose - the render
  // window is built from it, so it must not name the far target.
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

/**
 * A repeated click is a MOVE click that arrives while the carousel is already
 * animating in the same direction. It does not change the destination model:
 * the next target is still the next page boundary. It only selects the fast
 * motion profile in the motion layer.
 */
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
