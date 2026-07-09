import { useEffect, useMemo } from "react";

import type { CarouselSlideRecord } from "../../domain";
import type { ImageResourceStore } from "./types";

/** Stable empty set for the images-off case: one frozen reference, so the
 * prune effect below never re-fires on data changes while `isContentImg` is
 * off. */
const EMPTY_IMAGE_URLS: readonly string[] = Object.freeze([]);

/** Every distinct image URL in the live deck — the set the store retains.
 * Deduped (clones from page padding / cyclic keys repeat URLs); non-string
 * content (numbers, React elements) is not an image URL. */
const collectImageResourceUrls = (
  records: CarouselSlideRecord[],
  isContentImg: boolean,
): readonly string[] => {
  if (!isContentImg) return EMPTY_IMAGE_URLS;
  const urls = new Set<string>();
  for (const record of records) {
    const { content } = record.slideData;
    if (typeof content === "string") urls.add(content);
  }
  return [...urls];
};

interface UseImageResourceRetentionInput {
  store: ImageResourceStore | null;
  records: CarouselSlideRecord[];
  isContentImg: boolean;
}

/**
 * Keeps the store's per-URL entries bounded to the live deck. Entries are
 * lightweight (render status + retry bookkeeping), but they carry LIVE retry
 * timers — on a data replacement (e.g. swapping slide sets) any URL no longer
 * present is dropped and its pending timer released, so the store can never
 * accumulate stale entries or fire retries for images the deck no longer
 * contains. The lifecycle counterpart of the store's `dispose()`: `prune`
 * trims by data, `dispose` resets by component lifetime.
 */
export function useImageResourceRetention({
  store,
  records,
  isContentImg,
}: UseImageResourceRetentionInput): void {
  const urls = useMemo(
    () => collectImageResourceUrls(records, isContentImg),
    [isContentImg, records],
  );

  useEffect(() => {
    store?.prune(urls);
  }, [store, urls]);
}
