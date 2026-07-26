// See docs/architecture/slides.md
import { useEffect, useMemo } from "react";

import { resolveRenderedImageSrc } from "../../domain";
import type { CarouselSlideRecord } from "../../domain";
import type { ImageResourceStore } from "./types";

const EMPTY_IMAGE_URLS: readonly string[] = Object.freeze([]);

const collectImageResourceUrls = (
  records: CarouselSlideRecord[],
  isContentImg: boolean,
  isResponsiveImagesOn: boolean,
): readonly string[] => {
  if (!isContentImg) return EMPTY_IMAGE_URLS;
  const urls = new Set<string>();
  for (const record of records) {
    // Same rule the renderer keys on — retention must not prune a live URL.
    const src = resolveRenderedImageSrc(record.slideData, isResponsiveImagesOn);
    if (src !== null) urls.add(src);
  }
  return [...urls];
};

interface UseImageResourceRetentionInput {
  store: ImageResourceStore | null;
  records: CarouselSlideRecord[];
  isContentImg: boolean;
  isResponsiveImagesOn: boolean;
}

/** Prunes the store's entries + retry timers to the live deck (prune by data). */
export function useImageResourceRetention({
  store,
  records,
  isContentImg,
  isResponsiveImagesOn,
}: UseImageResourceRetentionInput): void {
  const urls = useMemo(
    () => collectImageResourceUrls(records, isContentImg, isResponsiveImagesOn),
    [isContentImg, isResponsiveImagesOn, records],
  );

  useEffect(() => {
    store?.prune(urls);
  }, [store, urls]);
}
