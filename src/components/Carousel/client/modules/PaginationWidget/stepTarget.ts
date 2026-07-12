/**
 * Pure target resolution for one widget step. The widget is a decoupled
 * one-step indicator: each engine plan moves it ONE step; WHERE that step
 * lands depends on what the widget was doing when the plan arrived.
 *
 * `previous` is the step still animating (click retargets arrive while it
 * runs). `interrupted` is the step a finger GRAB tore down (follow mode
 * cancels the animation, so `previous` is gone by release time) — without
 * this memory a repeat swipe would resolve `floor(from) + 1`, i.e. the
 * ALREADY incoming dot, and the widget would freeze while the deck advances
 * one page beyond (the repeated click, whose `previous` survives, steps
 * correctly). The branches mirror each other deliberately:
 *
 * - same `targetKey`         → same logical destination, keep the target
 *   (retiming / a sub-threshold release snapping to the incoming page);
 * - same non-zero direction  → the deck advanced one page beyond, so does
 *   the widget: `target + direction`;
 * - otherwise                → plain geometry from the live offset.
 */

export interface WidgetStepMemory {
  target: number;
  direction: number;
  targetKey: number;
}

interface ResolveWidgetStepTargetInput {
  direction: number;
  targetKey: number;
  from: number;
  previous: WidgetStepMemory | null;
  interrupted: WidgetStepMemory | null;
}

export const resolveWidgetStepTarget = ({
  direction,
  targetKey,
  from,
  previous,
  interrupted,
}: ResolveWidgetStepTargetInput): number => {
  const memory = previous ?? interrupted;

  if (memory && targetKey === memory.targetKey) return memory.target;
  if (memory && direction !== 0 && direction === memory.direction) {
    return memory.target + direction;
  }
  if (direction > 0) return Math.floor(from) + 1;
  if (direction < 0) return Math.ceil(from) - 1;
  return Math.round(from);
};
