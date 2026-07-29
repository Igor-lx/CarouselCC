// Pure target resolution for one widget step, over two memories (the live step
// and the grab-interrupted step). See docs/architecture/modules.md
export interface WidgetStepMemory {
  target: number;
  direction: number;
  targetKey: number;
}

/**
 * How far past the LIVE offset a step may land. A chained retarget
 * (`memory.target + direction`) is otherwise unbounded: click faster than the
 * strip animates and the destination runs away from the dots that exist to show
 * it. The binding's element coverage is sized for exactly this reach
 * (`DOT_COVERAGE_MARGIN_SLOTS` = `2 * WIDGET_STEP_LOOKAHEAD`), so the two move
 * together — raising one without the other silently drops the arriving dot's
 * animation.
 *
 * The value matches the deck's own `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`: the
 * indicator stays exactly as far ahead of what the eye sees as the deck does.
 */
export const WIDGET_STEP_LOOKAHEAD = 2;

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

  let target: number;
  if (memory && targetKey === memory.targetKey) {
    target = memory.target;
  } else if (memory && direction !== 0 && direction === memory.direction) {
    target = memory.target + direction;
  } else if (direction > 0) {
    target = Math.floor(from) + 1;
  } else if (direction < 0) {
    target = Math.ceil(from) - 1;
  } else {
    target = Math.round(from);
  }

  // A no-op for every geometric branch (they land one step out by construction);
  // it bites only on a chained retarget, which is what can run away.
  return Math.min(
    Math.floor(from) + WIDGET_STEP_LOOKAHEAD,
    Math.max(Math.ceil(from) - WIDGET_STEP_LOOKAHEAD, target),
  );
};
