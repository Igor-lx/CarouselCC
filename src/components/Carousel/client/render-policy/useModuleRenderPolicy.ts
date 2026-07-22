import { useMemo, type ReactNode } from "react";

/**
 * The diagnostic layer is a DEVELOPMENT tool end to end: it renders nothing,
 * mutates nothing, and its only output is `console.warn`, which was already
 * dev-only. Gating its ATTACHMENT here makes that true of its cost as well —
 * in production the slot never mounts, never consumes the diagnostic context,
 * and never re-renders on a dispatch. Measured: the two frames the carousel
 * spends main-thread time in (the click frame and the settle window) are
 * dominated by the React render of this subtree, so a component that produces
 * nothing must not be in it. A host may leave `<Diagnostic />` in its JSX
 * permanently — it simply costs nothing shipped.
 */
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
  // Attachment as the RUNTIME sees it: dev-only (see IS_DEV above).
  const isDiagnosticAttached = hasDiagnosticSlot && IS_DEV;
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
      isDiagnosticActive: isDiagnosticAttached,
      slots: {
        controls: isControlsOn && canSlide && hasControlsSlot ? controlsSlot : null,
        pagination:
          isPaginationOn && canSlide && hasPaginationSlot ? paginationSlot : null,
        // Headless like Diagnostic: renders whenever attached — its PRESENCE
        // is the switch that turns the responsive-image stack on.
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
