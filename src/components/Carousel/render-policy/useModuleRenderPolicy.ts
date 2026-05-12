import { useMemo, type ReactNode } from "react";

interface UseModuleRenderPolicyInput {
  controlsSlot: ReactNode;
  paginationSlot: ReactNode;
  isControlsOn: boolean;
  isPaginationOn: boolean;
  canSlide: boolean;
}

export interface ModuleRenderPolicy {
  hasControlsSlot: boolean;
  hasPaginationSlot: boolean;
  shouldRenderControls: boolean;
  shouldRenderPagination: boolean;
}

export function useModuleRenderPolicy({
  controlsSlot,
  paginationSlot,
  isControlsOn,
  isPaginationOn,
  canSlide,
}: UseModuleRenderPolicyInput): ModuleRenderPolicy {
  const hasControlsSlot = Boolean(controlsSlot);
  const hasPaginationSlot = Boolean(paginationSlot);

  return useMemo(
    () => ({
      hasControlsSlot,
      hasPaginationSlot,
      shouldRenderControls: isControlsOn && canSlide && hasControlsSlot,
      shouldRenderPagination: isPaginationOn && hasPaginationSlot,
    }),
    [canSlide, hasControlsSlot, hasPaginationSlot, isControlsOn, isPaginationOn],
  );
}
