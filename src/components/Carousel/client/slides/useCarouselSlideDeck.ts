// See docs/architecture/slides.md
import { useMemo } from "react";

import {
  buildCarouselLayout,
  buildSlideRecords,
  hasPartialPageLayout,
  padDeckToFullPage,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";
import type { Slide } from "../public-api/types";

interface UseCarouselSlideDeckInput {
  slidesData: Slide[];
  visibleSlidesCount: number;
  isFinite: boolean;
  isFullPagesOn: boolean;
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
  isFullPagesOn,
}: UseCarouselSlideDeckInput): UseCarouselSlideDeckResult {
  const rawRecords = useMemo(() => buildSlideRecords(slidesData), [slidesData]);

  const hasPartial = hasPartialPageLayout(
    rawRecords.length,
    visibleSlidesCount,
  );
  const didExtend = isFullPagesOn && hasPartial;

  const records = useMemo(
    () =>
      didExtend
        ? padDeckToFullPage(rawRecords, visibleSlidesCount)
        : rawRecords,
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
