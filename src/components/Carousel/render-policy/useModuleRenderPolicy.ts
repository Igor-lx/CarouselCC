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

  // Controls and pagination follow one symmetric rule: a module renders only
  // when its flag is on, its slot is attached, AND the deck can actually slide
  // (`!canSlide` means a single page — neither edge controls nor dots have a
  // destination). Gating both here means the slot modules never mount in a
  // no-op state and need no internal `pageCount <= 1` guard of their own.
  // Diagnostic is intentionally different: it renders whenever attached and
  // only reports observations. Its presence is still resolved here so all slot
  // checks have one owner.
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
