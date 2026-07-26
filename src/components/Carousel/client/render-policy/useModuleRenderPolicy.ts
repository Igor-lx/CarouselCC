// See docs/architecture/render-policy.md
import { useMemo, type ReactNode } from "react";

const IS_DEV = import.meta.env.DEV;

interface UseModuleRenderPolicyInput {
  controlsSlot: ReactNode;
  paginationSlot: ReactNode;
  diagnosticSlot: ReactNode;
  responsiveImagesSlot: ReactNode;
  isControlsOn: boolean;
  isPaginationOn: boolean;
  canSlide: boolean;
}

/** Slot children resolved against the policy; a silenced module is `null`. */
export interface GatedModuleSlots {
  controls: ReactNode;
  pagination: ReactNode;
  responsiveImages: ReactNode;
  diagnostic: ReactNode;
}

export interface ModuleRenderPolicy {
  /** Attachment flags — Diagnostics audits the host's wiring against them. */
  hasControlsSlot: boolean;
  hasPaginationSlot: boolean;
  hasDiagnosticSlot: boolean;
  hasResponsiveImagesSlot: boolean;
  isDiagnosticActive: boolean;
  slots: GatedModuleSlots;
}

export function useModuleRenderPolicy({
  controlsSlot,
  paginationSlot,
  diagnosticSlot,
  responsiveImagesSlot,
  isControlsOn,
  isPaginationOn,
  canSlide,
}: UseModuleRenderPolicyInput): ModuleRenderPolicy {
  const hasControlsSlot = Boolean(controlsSlot);
  const hasPaginationSlot = Boolean(paginationSlot);
  const hasDiagnosticSlot = Boolean(diagnosticSlot);
  const isDiagnosticAttached = hasDiagnosticSlot && IS_DEV; // dev-only, by design
  const hasResponsiveImagesSlot = Boolean(responsiveImagesSlot);

  return useMemo(
    () => ({
      hasControlsSlot,
      hasPaginationSlot,
      hasDiagnosticSlot,
      hasResponsiveImagesSlot,
      isDiagnosticActive: isDiagnosticAttached,
      slots: {
        controls: isControlsOn && canSlide && hasControlsSlot ? controlsSlot : null,
        pagination:
          isPaginationOn && canSlide && hasPaginationSlot ? paginationSlot : null,
        responsiveImages: hasResponsiveImagesSlot ? responsiveImagesSlot : null,
        diagnostic: isDiagnosticAttached ? diagnosticSlot : null,
      },
    }),
    [
      canSlide,
      controlsSlot,
      diagnosticSlot,
      hasControlsSlot,
      hasDiagnosticSlot,
      isDiagnosticAttached,
      hasPaginationSlot,
      hasResponsiveImagesSlot,
      isControlsOn,
      isPaginationOn,
      paginationSlot,
      responsiveImagesSlot,
    ],
  );
}
