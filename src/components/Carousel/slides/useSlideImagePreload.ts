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
  imageSizes: string;
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
  imageSizes: string;
  isMediaMatch?: (media: string) => boolean;
}

export interface SlideImagePreloadTarget {
  key: string;
  src: string;
  srcSet?: string;
  sizes?: string;
}

const slideImagePreloadTarget = (
  record: CarouselSlideRecord,
  imageSizes: string,
  isMediaMatch?: (media: string) => boolean,
): SlideImagePreloadTarget | null => {
  const { content, image } = record.slideData;
  if (typeof content !== "string") return null;

  const matchedSource = image?.sources?.find((source) =>
    isMediaMatch?.(source.media) ?? false,
  );
  const srcSet = matchedSource?.srcSet ?? image?.srcSet;
  const sizes = matchedSource?.sizes ?? image?.sizes ?? imageSizes;
  const key = `${content}|${srcSet ?? ""}|${sizes ?? ""}`;

  return { key, src: content, srcSet, sizes };
};

const bandDistance = (index: number, bandStart: number, bandEnd: number): number =>
  index < bandStart ? bandStart - index : index - bandEnd;

export const collectIdlePreloadTargets = ({
  records,
  layout,
  currentVirtualIndex,
  neighborPageSpan,
  imageSizes,
  isMediaMatch,
}: CollectInput): SlideImagePreloadTarget[] => {
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

  const targetAt = (virtualIndex: number): SlideImagePreloadTarget | null => {
    const recordIndex = resolveRecordIndex(virtualIndex);
    return recordIndex === null
      ? null
      : slideImagePreloadTarget(records[recordIndex]!, imageSizes, isMediaMatch);
  };

  const visibleUrls = new Set<string>();
  for (let index = bandStart; index <= bandEnd; index += 1) {
    const target = targetAt(index);
    if (target) visibleUrls.add(target.src);
  }

  const indices: number[] = [];
  for (let index = bandStart - radius; index <= bandEnd + radius; index += 1) {
    if (index >= bandStart && index <= bandEnd) continue;
    indices.push(index);
  }
  indices.sort(
    (a, b) => bandDistance(a, bandStart, bandEnd) - bandDistance(b, bandStart, bandEnd),
  );

  const targets = new Map<string, SlideImagePreloadTarget>();
  for (const virtualIndex of indices) {
    const target = targetAt(virtualIndex);
    if (target && !visibleUrls.has(target.src)) targets.set(target.key, target);
  }
  return [...targets.values()];
};

const releaseWarmImage = (image: HTMLImageElement): void => {
  image.removeAttribute("src");
};

export function useSlideImagePreload({
  records,
  layout,
  currentVirtualIndex,
  imageSizes,
  isIdle,
  isContentImg,
  isDataSaverEnabled,
  isWarmable,
}: UseSlideImagePreloadInput): void {
  const isEnabled = isContentImg && !isDataSaverEnabled;
  const warmedRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const targetImages = useMemo<SlideImagePreloadTarget[] | null>(() => {
    if (!isEnabled) return [];
    if (!isIdle) return null;
    return collectIdlePreloadTargets({
      records,
      layout,
      currentVirtualIndex,
      imageSizes,
      neighborPageSpan: PRELOAD_NEIGHBOR_PAGE_SPAN,
      isMediaMatch:
        typeof window === "undefined"
          ? undefined
          : (media) => window.matchMedia(media).matches,
    });
  }, [currentVirtualIndex, imageSizes, isEnabled, isIdle, layout, records]);

  useEffect(() => {
    if (targetImages === null || typeof window === "undefined") return;

    const warmed = warmedRef.current;
    const keep = new Set(targetImages.map((target) => target.key));

    warmed.forEach((image, url) => {
      if (keep.has(url)) return;
      releaseWarmImage(image);
      warmed.delete(url);
    });

    for (const target of targetImages) {
      if (warmed.has(target.key) || !isWarmable(target.src)) continue;
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.sizes = target.sizes ?? "";
      image.srcset = target.srcSet ?? "";
      image.src = target.src;
      warmed.set(target.key, image);
      if (typeof image.decode === "function") {
        image.decode().catch(() => undefined);
      }
    }
  }, [targetImages, isWarmable]);

  useEffect(() => {
    const warmed = warmedRef.current;
    return () => {
      warmed.forEach(releaseWarmImage);
      warmed.clear();
    };
  }, []);
}
