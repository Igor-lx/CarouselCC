// Pure target resolution for one widget step, over two memories (the live step
// and the grab-interrupted step). See docs/architecture/modules.md
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
