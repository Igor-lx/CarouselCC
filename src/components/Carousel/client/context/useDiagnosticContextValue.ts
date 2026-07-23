import { useMemo } from "react";

import type { CarouselState } from "../state";
import type { UserEnvironment } from "../public-api/types";
import type { CarouselDiagnosticContextValue } from "./types";

/**
 * The diagnostic layer is a development tool, and since the render policy
 * stopped attaching it in production nothing consumes this context there.
 * Building the value anyway meant a fresh object and a re-identified provider
 * on EVERY dispatch — twice per ride, in the two frames the carousel spends
 * main-thread time in. In production the hook now yields one frozen value,
 * so the provider never re-identifies and the sub-views cost nothing.
 */
const IS_DEV = import.meta.env.DEV;

/** The production stand-in: shape-complete, referentially fixed, never read. */
const SILENT_VALUE = Object.freeze({
  state: null,
  props: null,
  layout: null,
  slots: null,
}) as unknown as CarouselDiagnosticContextValue;

interface UseDiagnosticContextValueInput {
  /** Full effective state — carries its own layout, so the structural
   * validator inside `<Diagnostic />` can never receive a state/layout pair
   * from different render turns. */
  state: CarouselState;
  // Raw public props, exactly as the caller passed them (undefined included):
  // the diagnostic layer audits what the user wrote, not the resolved config.
  visibleSlidesNr: number | undefined;
  durationAutoplay: number | undefined;
  durationStep: number | undefined;
  intervalAutoplay: number | undefined;
  errAltPlaceholder: string | undefined;
  userEnvironment: UserEnvironment | undefined;
  // Observable layout facts.
  rawLength: number;
  extendedLength: number;
  didExtendLayout: boolean;
  hasPerfectPageLayout: boolean;
  /** Resolved config count (pre-clamp) — what the caller asked for. */
  requestedVisibleSlidesCount: number;
  /** Effective count actually used: `min(requested, rawLength)`. */
  visibleSlidesCount: number;
  canSlide: boolean;
  // Slot wiring facts.
  isControlsOn: boolean;
  hasControlsSlot: boolean;
  isPaginationOn: boolean;
  hasPaginationSlot: boolean;
  isPaginationInteractiveOn: boolean;
  hasResponsiveImagesSlot: boolean;
  deckCarriesImageSets: boolean;
}

/**
 * Assembles the value behind `CarouselDiagnosticContext`: raw props +
 * observable layout/slot state, mirrored exactly as the runtime sees them
 * (diagnostic data never feeds back into runtime). The sub-views are
 * memoised independently, so a change in one (e.g. a slot toggle) leaves the
 * others referentially stable.
 */
export function useDiagnosticContextValue({
  state,
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  intervalAutoplay,
  errAltPlaceholder,
  userEnvironment,
  rawLength,
  extendedLength,
  didExtendLayout,
  hasPerfectPageLayout,
  requestedVisibleSlidesCount,
  visibleSlidesCount,
  canSlide,
  isControlsOn,
  hasControlsSlot,
  isPaginationOn,
  hasPaginationSlot,
  isPaginationInteractiveOn,
  hasResponsiveImagesSlot,
  deckCarriesImageSets,
}: UseDiagnosticContextValueInput): CarouselDiagnosticContextValue {
  const propsView = useMemo(
    () => ({
      visibleSlidesNr,
      durationAutoplay,
      durationStep,
      intervalAutoplay,
      errAltPlaceholder,
      userEnvironment,
    }),
    [
      durationAutoplay,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      userEnvironment,
      visibleSlidesNr,
    ],
  );

  const layoutView = useMemo(
    () => ({
      rawLength,
      requestedVisibleSlidesCount,
      extendedLength,
      didExtendLayout,
      hasPerfectPageLayout,
      visibleSlidesCount,
      canSlide,
    }),
    [
      canSlide,
      didExtendLayout,
      extendedLength,
      hasPerfectPageLayout,
      rawLength,
      requestedVisibleSlidesCount,
      visibleSlidesCount,
    ],
  );

  const slotsView = useMemo(
    () => ({
      isControlsOn,
      hasControlsSlot,
      isPaginationOn,
      hasPaginationSlot,
      isPaginationInteractiveOn,
      hasResponsiveImagesSlot,
      deckCarriesImageSets,
    }),
    [
      deckCarriesImageSets,
      hasControlsSlot,
      hasPaginationSlot,
      hasResponsiveImagesSlot,
      isControlsOn,
      isPaginationInteractiveOn,
      isPaginationOn,
    ],
  );

  return useMemo(
    () =>
      IS_DEV
        ? {
            state,
            props: propsView,
            layout: layoutView,
            slots: slotsView,
          }
        : SILENT_VALUE,
    [layoutView, propsView, slotsView, state],
  );
}
