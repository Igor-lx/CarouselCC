import { useEffect, useMemo, useRef } from "react";

import { PRELOAD_NEIGHBOR_PAGE_SPAN } from "../config";
import {
  loopedSlideIndex,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";

interface UseSlideImagePreloadInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  isIdle: boolean;
  isContentImg: boolean;
  isDataSaverEnabled: boolean;
  isWarmable: (url: string) => boolean;
}

interface CollectInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  neighborPageSpan: number;
}

const slideImageSource = (record: CarouselSlideRecord): string | null =>
  typeof record.slideData.content === "string" ? record.slideData.content : null;

const bandDistance = (index: number, bandStart: number, bandEnd: number): number =>
  index < bandStart ? bandStart - index : index - bandEnd;

export const collectIdlePreloadUrls = ({
  records,
  layout,
  currentVirtualIndex,
  neighborPageSpan,
}: CollectInput): string[] => {
  const recordCount = records.length;
  if (recordCount === 0 || !layout.canSlide) return [];

  const visible = layout.visibleSlidesCount;
  const current = Math.round(currentVirtualIndex);
  const radius = visible * neighborPageSpan;
  const bandStart = current;
  const bandEnd = current + visible - 1;

  const resolveRecordIndex = (virtualIndex: number): number | null =>
    layout.isFinite
      ? virtualIndex >= 0 && virtualIndex < recordCount
        ? virtualIndex
        : null
      : loopedSlideIndex(virtualIndex, recordCount);

  const urlAt = (virtualIndex: number): string | null => {
    const recordIndex = resolveRecordIndex(virtualIndex);
    return recordIndex === null ? null : slideImageSource(records[recordIndex]!);
  };

  const visibleUrls = new Set<string>();
  for (let index = bandStart; index <= bandEnd; index += 1) {
    const src = urlAt(index);
    if (src) visibleUrls.add(src);
  }

  const indices: number[] = [];
  for (let index = bandStart - radius; index <= bandEnd + radius; index += 1) {
    if (index >= bandStart && index <= bandEnd) continue;
    indices.push(index);
  }
  indices.sort(
    (a, b) => bandDistance(a, bandStart, bandEnd) - bandDistance(b, bandStart, bandEnd),
  );

  const urls = new Set<string>();
  for (const virtualIndex of indices) {
    const src = urlAt(virtualIndex);
    if (src && !visibleUrls.has(src)) urls.add(src);
  }
  return [...urls];
};

const releaseWarmImage = (image: HTMLImageElement): void => {
  image.removeAttribute("src");
};

export function useSlideImagePreload({
  records,
  layout,
  currentVirtualIndex,
  isIdle,
  isContentImg,
  isDataSaverEnabled,
  isWarmable,
}: UseSlideImagePreloadInput): void {
  const isEnabled = isContentImg && !isDataSaverEnabled;
  const warmedRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const targetUrls = useMemo<string[] | null>(() => {
    if (!isEnabled) return [];
    if (!isIdle) return null;
    return collectIdlePreloadUrls({
      records,
      layout,
      currentVirtualIndex,
      neighborPageSpan: PRELOAD_NEIGHBOR_PAGE_SPAN,
    });
  }, [isEnabled, isIdle, records, layout, currentVirtualIndex]);

  useEffect(() => {
    if (targetUrls === null || typeof window === "undefined") return;

    const warmed = warmedRef.current;
    const keep = new Set(targetUrls);

    warmed.forEach((image, url) => {
      if (keep.has(url)) return;
      releaseWarmImage(image);
      warmed.delete(url);
    });

    for (const url of targetUrls) {
      if (warmed.has(url) || !isWarmable(url)) continue;
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = url;
      warmed.set(url, image);
      if (typeof image.decode === "function") {
        image.decode().catch(() => undefined);
      }
    }
  }, [targetUrls, isWarmable]);

  useEffect(() => {
    const warmed = warmedRef.current;
    return () => {
      warmed.forEach(releaseWarmImage);
      warmed.clear();
    };
  }, []);
}
