import { useMemo } from "react";

import {
  buildCarouselLayout,
  buildSlideRecords,
  hasPartialPageLayout,
  padDeckToFullPage,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";
import type { Slide } from "../types";

interface UseCarouselSlideDeckInput {
  slidesData: Slide[];
  visibleSlidesCount: number;
  isFinite: boolean;
  isPagePaddingOn: boolean;
}

interface PerfectPageLayoutInfo {
  hasPerfectPageLayout: boolean;
  rawLength: number;
  extendedLength: number;
  didExtendLayout: boolean;
}

interface UseCarouselSlideDeckResult {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  perfectPageLayoutInfo: PerfectPageLayoutInfo;
}

export function useCarouselSlideDeck({
  slidesData,
  visibleSlidesCount,
  isFinite,
  isPagePaddingOn,
}: UseCarouselSlideDeckInput): UseCarouselSlideDeckResult {
  const rawRecords = useMemo(() => buildSlideRecords(slidesData), [slidesData]);

  const hasPartial = hasPartialPageLayout(rawRecords.length, visibleSlidesCount);
  const didExtend = isPagePaddingOn && hasPartial;

  const records = useMemo(
    () => (didExtend ? padDeckToFullPage(rawRecords, visibleSlidesCount) : rawRecords),
    [didExtend, rawRecords, visibleSlidesCount],
  );

  const layout = useMemo(
    () => buildCarouselLayout(records, visibleSlidesCount, isFinite),
    [isFinite, records, visibleSlidesCount],
  );

  const perfectPageLayoutInfo = useMemo<PerfectPageLayoutInfo>(
    () => ({
      hasPerfectPageLayout: !hasPartial,
      rawLength: rawRecords.length,
      extendedLength: records.length,
      didExtendLayout: didExtend,
    }),
    [didExtend, hasPartial, rawRecords.length, records.length],
  );

  return { records, layout, perfectPageLayoutInfo };
}
