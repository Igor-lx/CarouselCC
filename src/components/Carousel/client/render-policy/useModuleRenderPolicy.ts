import { useMemo, type ReactNode } from "react";

interface UseModuleRenderPolicyInput {
  controlsSlot: ReactNode;
  paginationSlot: ReactNode;
  diagnosticSlot: ReactNode;
  responsiveImagesSlot: ReactNode;
  isControlsOn: boolean;
  isPaginationOn: boolean;
  canSlide: boolean;
}

/** The slot children ALREADY resolved against the policy: a module the policy
 * silences is `null` here. The view renders these directly and carries no
 * conditionals of its own — the policy is the single owner of the decision,
 * not just of the booleans behind it. */
export interface GatedModuleSlots {
  controls: ReactNode;
  pagination: ReactNode;
  responsiveImages: ReactNode;
  diagnostic: ReactNode;
}

export interface ModuleRenderPolicy {
  /** Attachment flags — Diagnostics audits the host's wiring against them
   * (e.g. a prop that only means something with its module attached). */
  hasControlsSlot: boolean;
  hasPaginationSlot: boolean;
  hasDiagnosticSlot: boolean;
  hasResponsiveImagesSlot: boolean;
  /** The Diagnostic module is attached and therefore observing. */
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
  const hasResponsiveImagesSlot = Boolean(responsiveImagesSlot);

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
      hasResponsiveImagesSlot,
      isDiagnosticActive: hasDiagnosticSlot,
      slots: {
        controls: isControlsOn && canSlide && hasControlsSlot ? controlsSlot : null,
        pagination:
          isPaginationOn && canSlide && hasPaginationSlot ? paginationSlot : null,
        // Headless like Diagnostic: renders whenever attached — its PRESENCE
        // is the switch that turns the responsive-image stack on.
        responsiveImages: hasResponsiveImagesSlot ? responsiveImagesSlot : null,
        diagnostic: hasDiagnosticSlot ? diagnosticSlot : null,
      },
    }),
    [
      canSlide,
      controlsSlot,
      diagnosticSlot,
      hasControlsSlot,
      hasDiagnosticSlot,
      hasPaginationSlot,
      hasResponsiveImagesSlot,
      isControlsOn,
      isPaginationOn,
      paginationSlot,
      responsiveImagesSlot,
    ],
  );
}
