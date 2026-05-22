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

  // Controls and pagination follow one symmetric rule: a module renders only
  // when its flag is on, its slot is attached, AND the deck can actually slide
  // (`!canSlide` means a single page — neither edge controls nor dots have a
  // destination). Gating both here means the slot modules never mount in a
  // no-op state and need no internal `pageCount <= 1` guard of their own.
  return useMemo(
    () => ({
      hasControlsSlot,
      hasPaginationSlot,
      shouldRenderControls: isControlsOn && canSlide && hasControlsSlot,
      shouldRenderPagination: isPaginationOn && canSlide && hasPaginationSlot,
    }),
    [canSlide, hasControlsSlot, hasPaginationSlot, isControlsOn, isPaginationOn],
  );
}
