// The two-wave bandwidth gate (opens on first reported outcome, no timeout
// fuse). See docs/architecture/slides.md
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveRenderedImageSrc } from "../domain";
import type { VirtualSlide } from "../domain";
import type { ImageResourceStore } from "./imageResource";

interface UseActiveBandGateInput {
  virtualSlides: readonly VirtualSlide[];
  isContentImg: boolean;
  isResponsiveImagesOn: boolean;
  imageResourceStore: ImageResourceStore | null;
}

export function useActiveBandGate({
  virtualSlides,
  isContentImg,
  isResponsiveImagesOn,
  imageResourceStore,
}: UseActiveBandGateInput): boolean {
  // Band URLs stabilised on CONTENT — virtualSlides is a fresh array per
  // dispatch, so keying the effect on it alone would churn subscriptions.
  const bandUrlsRef = useRef<string[]>([]);
  const bandUrls = useMemo(() => {
    const next: string[] = [];
    if (isContentImg && imageResourceStore !== null) {
      for (const slide of virtualSlides) {
        if (!slide.isActual || !slide.slideData) continue;
        const url = resolveRenderedImageSrc(
          slide.slideData,
          isResponsiveImagesOn,
        );
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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const store = imageResourceStore;
    if (store === null || bandUrls.length === 0) {
      setIsOpen(true);
      return;
    }

    const settled = settledRef.current;
    const evaluate = (): void => {
      for (const url of bandUrls) {
        if (settled.has(url)) continue;
        if (store.getSnapshot(url).status !== "loading") settled.add(url);
      }
      setIsOpen(bandUrls.every((url) => settled.has(url)));
    };

    const unsubscribes = bandUrls.map((url) => store.subscribe(url, evaluate));
    evaluate();
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [bandUrls, imageResourceStore]);

  return isOpen;
}
