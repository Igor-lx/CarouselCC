// See docs/architecture/context.md
import { useMemo } from "react";

import type { CarouselState } from "../state";
import type { UserEnvironment } from "../public-api/types";
import type { CarouselDiagnosticContextValue } from "./types";

const IS_DEV = import.meta.env.DEV;

/** Production stand-in: shape-complete, referentially fixed, never read. */
const SILENT_VALUE = Object.freeze({
  state: null,
  props: null,
  layout: null,
  slots: null,
}) as unknown as CarouselDiagnosticContextValue;

/** Production sub-view stand-in; typed `never` so each memo keeps its DEV shape. */
const SILENT_SUBVIEW = null as never;

interface UseDiagnosticContextValueInput {
  state: CarouselState;
  visibleSlidesNr: number | undefined;
  durationAutoplay: number | undefined;
  durationStep: number | undefined;
  intervalAutoplay: number | undefined;
  errAltPlaceholder: string | undefined;
  userEnvironment: UserEnvironment | undefined;
  rawLength: number;
  extendedLength: number;
  didExtendLayout: boolean;
  hasPerfectPageLayout: boolean;
  /** Resolved config count (pre-clamp) — what the caller asked for. */
  requestedVisibleSlidesCount: number;
  /** Effective count used: `min(requested, rawLength)`. */
  visibleSlidesCount: number;
  canSlide: boolean;
  isControlsOn: boolean;
  hasControlsSlot: boolean;
  isPaginationOn: boolean;
  hasPaginationSlot: boolean;
  isPaginationInteractiveOn: boolean;
  hasResponsiveImagesSlot: boolean;
  deckCarriesImageSets: boolean;
}

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
    () =>
      IS_DEV
        ? {
            visibleSlidesNr,
            durationAutoplay,
            durationStep,
            intervalAutoplay,
            errAltPlaceholder,
            userEnvironment,
          }
        : SILENT_SUBVIEW,
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
    () =>
      IS_DEV
        ? {
            rawLength,
            requestedVisibleSlidesCount,
            extendedLength,
            didExtendLayout,
            hasPerfectPageLayout,
            visibleSlidesCount,
            canSlide,
          }
        : SILENT_SUBVIEW,
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
    () =>
      IS_DEV
        ? {
            isControlsOn,
            hasControlsSlot,
            isPaginationOn,
            hasPaginationSlot,
            isPaginationInteractiveOn,
            hasResponsiveImagesSlot,
            deckCarriesImageSets,
          }
        : SILENT_SUBVIEW,
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
