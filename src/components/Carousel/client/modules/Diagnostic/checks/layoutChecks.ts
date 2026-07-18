import type { CarouselDiagnosticContextValue } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

const LAYOUT_LAYER = "Layout";
const SLOT_LAYER = "Slots";

/**
 * Slot attachment mismatch (LOGICAL): user asked for a Controls / Pagination
 * module but did not pass the corresponding child.
 */
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

  if (slots.deckCarriesImageSets && !slots.hasResponsiveImagesSlot) {
    out.push({
      severity: "LOGICAL",
      layer: SLOT_LAYER,
      field: "ResponsiveImages",
      actual: false,
      expected:
        "Slides carry responsive image variants; mount <ResponsiveImages /> to use them",
      consequence:
        "Deliberate quality-first mode: every viewport loads the LARGEST candidate, no art direction, no preload",
    });
  }

  if (slots.hasResponsiveImagesSlot && !slots.deckCarriesImageSets) {
    out.push({
      severity: "LOGICAL",
      layer: SLOT_LAYER,
      field: "ResponsiveImages",
      actual: true,
      expected:
        "Expected slides with image variants (srcSet / sources) when <ResponsiveImages /> is mounted",
      consequence:
        "Only neighbour-page preloading of the single set is active — no responsive selection to perform",
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

  if (slots.isPaginationInteractiveOn && !slots.isPaginationOn) {
    out.push({
      severity: "LOGICAL",
      layer: SLOT_LAYER,
      field: "isPaginationInteractiveOn",
      actual: true,
      expected:
        "Expected isPaginationOn to be true when isPaginationInteractiveOn is true, or isPaginationInteractiveOn={false}",
      consequence:
        "The flag decides nothing: with pagination off there are no dots to make clickable",
    });
  }

  return out;
};

/**
 * Layout invariants (LOGICAL): partial page layout without padding, or the
 * deck cannot slide because of slide count vs. visibleSlidesNr.
 */
export const collectLayoutWarnings = (
  layout: CarouselDiagnosticContextValue["layout"],
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (!layout.hasPerfectPageLayout) {
    if (layout.didExtendLayout) {
      out.push({
        severity: "LOGICAL",
        layer: LAYOUT_LAYER,
        field: "isFullPagesOn",
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
        expected: `Expected slides count divisible by visibleSlidesNr (${layout.visibleSlidesCount}), or isFullPagesOn={true}`,
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
