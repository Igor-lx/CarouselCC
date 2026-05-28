import type { CarouselDiagnosticContextValue } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

const LAYOUT_LAYER = "Layout";
const SLOT_LAYER = "Slots";

export const collectSlotWarnings = (
  slots: CarouselDiagnosticContextValue["slots"],
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (slots.isControlsOn && !slots.hasControlsSlot) {
    out.push({
      severity: "LOGICAL",
      layer: SLOT_LAYER,
      field: "isControlsOn",
      actual: true,
      expected:
        "Expected a <Controls /> child when isControlsOn is true, or isControlsOn={false}",
      consequence: "No prev/next controls render even though the consumer asked for them",
    });
  }

  if (slots.isPaginationOn && !slots.hasPaginationSlot) {
    out.push({
      severity: "LOGICAL",
      layer: SLOT_LAYER,
      field: "isPaginationOn",
      actual: true,
      expected:
        "Expected a <Pagination /> or <PaginationWidget /> child when isPaginationOn is true, or isPaginationOn={false}",
      consequence: "No pagination dots render even though the consumer asked for them",
    });
  }

  return out;
};

export const collectLayoutWarnings = (
  layout: CarouselDiagnosticContextValue["layout"],
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (!layout.hasPerfectPageLayout) {
    if (layout.didExtendLayout) {
      out.push({
        severity: "LOGICAL",
        layer: LAYOUT_LAYER,
        field: "isPagePaddingOn",
        actual: true,
        expected: `Expected slides count (${layout.rawLength}) divisible by visibleSlidesNr (${layout.visibleSlidesCount})`,
        consequence: `Deck was extended to ${layout.extendedLength} via cloned tail slides; align slide count to remove the clones`,
      });
    } else {
      out.push({
        severity: "LOGICAL",
        layer: LAYOUT_LAYER,
        field: "slidesData.length",
        actual: layout.rawLength,
        expected: `Expected slides count divisible by visibleSlidesNr (${layout.visibleSlidesCount}), or isPagePaddingOn={true}`,
        consequence: "The last page renders fewer slides than the visible band",
      });
    }
  }

  if (!layout.canSlide && layout.rawLength > 0) {
    out.push({
      severity: "LOGICAL",
      layer: LAYOUT_LAYER,
      field: "canSlide",
      actual: false,
      expected: `Expected slides count (${layout.rawLength}) greater than visibleSlidesNr (${layout.visibleSlidesCount})`,
      consequence:
        "Gesture, autoplay, controls and pagination are all disabled; the deck renders statically",
    });
  }

  return out;
};
