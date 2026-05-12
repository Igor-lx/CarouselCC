import { useMemo } from "react";

import {
  useGroupedDevNotice,
  type DevNoticeEntry,
} from "../../../../shared";
import type { CarouselDiagnosticContextValue } from "../../context";

const RUNTIME_SCOPE = "Carousel diagnostic";

export function useSlotAttachmentNotice(
  slot: CarouselDiagnosticContextValue["slotAttachment"],
) {
  const entries = useMemo<DevNoticeEntry[]>(() => {
    const list: DevNoticeEntry[] = [];
    if (slot.isControlsOn && !slot.hasControlsSlot) {
      list.push({
        field: "isControlsOn",
        message:
          'isControlsOn is true but no <Controls /> child was attached. ' +
          "Either pass a Controls slot or set isControlsOn={false}.",
      });
    }
    if (slot.isPaginationOn && !slot.hasPaginationSlot) {
      list.push({
        field: "isPaginationOn",
        message:
          'isPaginationOn is true but no <Pagination /> child was attached. ' +
          "Either pass a Pagination slot or set isPaginationOn={false}.",
      });
    }
    return list;
  }, [slot.hasControlsSlot, slot.hasPaginationSlot, slot.isControlsOn, slot.isPaginationOn]);

  useGroupedDevNotice({
    scope: RUNTIME_SCOPE,
    summary: "slot attachment mismatch",
    entries,
  });
}

export function usePerfectPageLayoutNotice(
  layout: CarouselDiagnosticContextValue["perfectPageLayout"],
) {
  const entries = useMemo<DevNoticeEntry[]>(() => {
    if (layout.hasPerfectPageLayout) return [];
    if (layout.didExtendLayout) {
      return [
        {
          field: "isPagePaddingOn",
          message:
            `${layout.rawLength} slides do not align with visibleSlidesNr=${layout.visibleSlidesCount}. ` +
            `Extended to ${layout.extendedLength} via cloned padding.`,
        },
      ];
    }
    return [
      {
        field: "slidesData.length",
        message:
          `${layout.rawLength} slides do not align with visibleSlidesNr=${layout.visibleSlidesCount}. ` +
          "Set isPagePaddingOn or align the slide count to avoid a partial last page.",
      },
    ];
  }, [
    layout.didExtendLayout,
    layout.extendedLength,
    layout.hasPerfectPageLayout,
    layout.rawLength,
    layout.visibleSlidesCount,
  ]);

  useGroupedDevNotice({
    scope: RUNTIME_SCOPE,
    summary: "page layout is not perfect",
    entries,
  });
}
