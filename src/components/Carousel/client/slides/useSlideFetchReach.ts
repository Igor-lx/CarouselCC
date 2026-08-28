// How far outside the visible band a slide may fetch its image, in lanes.
// See docs/architecture/slides.md
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveRenderedImageSrc } from "../domain";
import type { VirtualSlide } from "../domain";
import type { ImageResourceStore } from "./imageResource";

/** Everything the render window holds. */
const WHOLE_BUFFER = Number.POSITIVE_INFINITY;

interface UseSlideFetchReachInput {
  virtualSlides: readonly VirtualSlide[];
  isContentImg: boolean;
  isResponsiveImagesOn: boolean;
  imageResourceStore: ImageResourceStore | null;
  /** The deck is at rest. */
  isIdle: boolean;
}

/**
 * The band, then — once the deck is loaded AND STILL — the whole buffer.
 *
 * CONSTRAINT — the buffer must not open while the deck moves. Opening it mounts
 * an `<img>` into every buffered slide at once (two dozen on a desktop layout),
 * so their commit, fetch and decode all land in frames that are being animated.
 * The band settles roughly a second after mount, which falls inside a user's
 * first ride: gating on "the band reported" alone is therefore not enough.
 *
 * CONSTRAINT — the reach never shrinks once granted. Withdrawing it mid-ride
 * costs the same commit a second time and discards the in-flight bytes with it.
 *
 * Bandwidth, not reach, is the scarce resource early: opening wider ahead of
 * the band puts more concurrent fetches against the slides being looked at.
 */
export function useSlideFetchReach({
  virtualSlides,
  isContentImg,
  isResponsiveImagesOn,
  imageResourceStore,
  isIdle,
}: UseSlideFetchReachInput): number {
  // Band URLs stabilised on CONTENT — virtualSlides is a fresh array per
  // dispatch, so keying the effect on it alone would churn subscriptions.
  const bandUrlsRef = useRef<string[]>([]);
  const bandUrls = useMemo(() => {
    const next: string[] = [];
    if (isContentImg && imageResourceStore !== null) {
      for (const slide of virtualSlides) {
        if (!slide.isActual || !slide.slideData) continue;
        const url = resolveRenderedImageSrc(slide.slideData, isResponsiveImagesOn);
        if (url !== null && !next.includes(url)) next.push(url);
      }
    }
    const previous = bandUrlsRef.current;
    if (
      previous.length === next.length &&
      previous.every((url, index) => url === next[index])
    ) {
      return previous;
    }
    bandUrlsRef.current = next;
    return next;
  }, [imageResourceStore, isContentImg, isResponsiveImagesOn, virtualSlides]);

  // URLs that reported an outcome at least once — a write-once latch per URL.
  const settledRef = useRef(new Set<string>());
  const [isBandSettled, setIsBandSettled] = useState(false);

  useEffect(() => {
    const store = imageResourceStore;
    if (store === null || bandUrls.length === 0) {
      setIsBandSettled(true);
      return;
    }

    const settled = settledRef.current;
    const evaluate = (): void => {
      for (const url of bandUrls) {
        if (settled.has(url)) continue;
        if (store.getSnapshot(url).status !== "loading") settled.add(url);
      }
      setIsBandSettled(bandUrls.every((url) => settled.has(url)));
    };

    const unsubscribes = bandUrls.map((url) => store.subscribe(url, evaluate));
    evaluate();
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [bandUrls, imageResourceStore]);

  const [isBufferOpen, setIsBufferOpen] = useState(false);
  useEffect(() => {
    if (isBufferOpen || !isBandSettled || !isIdle) return;
    setIsBufferOpen(true);
  }, [isBandSettled, isBufferOpen, isIdle]);

  // 0 = the band only: `laneDistanceFromBand` is 0 inside it and >= 1 outside.
  return isBufferOpen ? WHOLE_BUFFER : 0;
}
