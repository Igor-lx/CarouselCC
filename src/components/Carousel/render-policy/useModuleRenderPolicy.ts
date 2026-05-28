import { useMemo, type ReactNode } from "react";

interface UseModuleRenderPolicyInput {
  controlsSlot: ReactNode;
  paginationSlot: ReactNode;
  diagnosticSlot: ReactNode;
  isControlsOn: boolean;
  isPaginationOn: boolean;
  canSlide: boolean;
}

export interface ModuleRenderPolicy {
  hasControlsSlot: boolean;
  hasPaginationSlot: boolean;
  hasDiagnosticSlot: boolean;
  shouldRenderControls: boolean;
  shouldRenderPagination: boolean;
  shouldRenderDiagnostic: boolean;
}

export function useModuleRenderPolicy({
  controlsSlot,
  paginationSlot,
  diagnosticSlot,
  isControlsOn,
  isPaginationOn,
  canSlide,
}: UseModuleRenderPolicyInput): ModuleRenderPolicy {
  const hasControlsSlot = Boolean(controlsSlot);
  const hasPaginationSlot = Boolean(paginationSlot);
  const hasDiagnosticSlot = Boolean(diagnosticSlot);

  return useMemo(
    () => ({
      hasControlsSlot,
      hasPaginationSlot,
      hasDiagnosticSlot,
      shouldRenderControls: isControlsOn && canSlide && hasControlsSlot,
      shouldRenderPagination: isPaginationOn && canSlide && hasPaginationSlot,
      shouldRenderDiagnostic: hasDiagnosticSlot,
    }),
    [
      canSlide,
      hasControlsSlot,
      hasDiagnosticSlot,
      hasPaginationSlot,
      isControlsOn,
      isPaginationOn,
    ],
  );
}
