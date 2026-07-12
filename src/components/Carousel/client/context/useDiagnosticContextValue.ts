import { useMemo } from "react";

import type { CarouselState } from "../state";
import type { UserEnvironment } from "../public-api/types";
import type { CarouselDiagnosticContextValue } from "./types";

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
  jumpSpeedMultiplier: number | undefined;
  intervalAutoplay: number | undefined;
  errAltPlaceholder: string | undefined;
  userEnvironment: UserEnvironment | undefined;
  // Observable layout facts.
  rawLength: number;
  extendedLength: number;
  didExtendLayout: boolean;
  hasPerfectPageLayout: boolean;
  visibleSlidesCount: number;
  canSlide: boolean;
  // Slot wiring facts.
  isControlsOn: boolean;
  hasControlsSlot: boolean;
  isPaginationOn: boolean;
  hasPaginationSlot: boolean;
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
  jumpSpeedMultiplier,
  intervalAutoplay,
  errAltPlaceholder,
  userEnvironment,
  rawLength,
  extendedLength,
  didExtendLayout,
  hasPerfectPageLayout,
  visibleSlidesCount,
  canSlide,
  isControlsOn,
  hasControlsSlot,
  isPaginationOn,
  hasPaginationSlot,
  hasResponsiveImagesSlot,
  deckCarriesImageSets,
}: UseDiagnosticContextValueInput): CarouselDiagnosticContextValue {
  const propsView = useMemo(
    () => ({
      visibleSlidesNr,
      durationAutoplay,
      durationStep,
      jumpSpeedMultiplier,
      intervalAutoplay,
      errAltPlaceholder,
      userEnvironment,
    }),
    [
      durationAutoplay,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      jumpSpeedMultiplier,
      userEnvironment,
      visibleSlidesNr,
    ],
  );

  const layoutView = useMemo(
    () => ({
      rawLength,
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
      visibleSlidesCount,
    ],
  );

  const slotsView = useMemo(
    () => ({
      isControlsOn,
      hasControlsSlot,
      isPaginationOn,
      hasPaginationSlot,
      hasResponsiveImagesSlot,
      deckCarriesImageSets,
    }),
    [
      deckCarriesImageSets,
      hasControlsSlot,
      hasPaginationSlot,
      hasResponsiveImagesSlot,
      isControlsOn,
      isPaginationOn,
    ],
  );

  return useMemo(
    () => ({
      state,
      props: propsView,
      layout: layoutView,
      slots: slotsView,
    }),
    [layoutView, propsView, slotsView, state],
  );
}
