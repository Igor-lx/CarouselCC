import { useEffect, useMemo, useRef, useState } from "react";

import { resolveRenderedImageSrc } from "../domain";
import type { VirtualSlide } from "../domain";
import type { ImageResourceStore } from "./imageResource";

/**
 * The bandwidth gate: off-band slides do not fetch until the visible band has.
 *
 * WHY IT EXISTS. The render window keeps `visibleSlidesCount ×
 * RENDER_WINDOW_BUFFER_MULTIPLIER` slides per side mounted, and every one of
 * them is a real `<img>` that starts fetching in the same millisecond as the
 * visible one. `fetchpriority` cannot fix that: priority orders a QUEUE, and
 * with five requests against six connections nothing ever queues — all five
 * share the pipe evenly. Measured on an emulated phone (Fast 3G, DPR 3), the
 * one slide the user is actually looking at arrived at 3.7 s while alone it
 * would have taken ~0.5 s; it was simply waiting behind four slides nobody
 * had asked for yet.
 *
 * So the deck fetches in two waves instead of one. Nothing loads faster in
 * total — the bytes and the pipe are the same, and the LAST image still lands
 * when it used to. Only the order changes: the visible band first, the buffer
 * right behind it. Nobody loses, and the slide being looked at wins.
 *
 * OPENING CONDITION. Not "loaded" but "reported an outcome at least once" —
 * success or error alike, latched per URL. A broken image retries on a backed
 * -off schedule and its status cycles `loading → error → loading`; a gate that
 * waited for `loaded` would open and shut on every cycle, repeatedly starting
 * and abandoning the buffer's fetches. Latching also makes a failed visible
 * image a non-event for the buffer: it has its own retry policy, and it must
 * not hold the rest of the deck hostage.
 *
 * NO TIMEOUT FUSE, deliberately. A gate that never opens is not a failure
 * mode here: `isActual` follows the TARGET page, so a slide the user rides to
 * becomes part of the band — and gets its source — in the very frame the ride
 * is planned. A stuck gate therefore degrades to "load on arrival", which is
 * simply the behaviour of a deck without a buffer. It also self-heals: the
 * gate reads the CURRENT band, so the first navigation past the stuck image
 * opens it.
 */
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
  // The band's rendered URLs, by the same rule the slides themselves use
  // (`resolveRenderedImageSrc`) — the gate must watch exactly the elements
  // that will report back, not a parallel guess at them.
  //
  // Identity is stabilised on CONTENT. `virtualSlides` is a fresh array on
  // every dispatch (its visibility flags move), so a memo keyed on it alone
  // handed the effect below a new list twice per ride — and the effect's job
  // is to unsubscribe from N URLs and resubscribe to N URLs. The band's URLs
  // change once per ride at most; the subscription churn (and the extra React
  // pass its `setIsOpen` provoked, measured at the worst possible moment: the
  // click frame) was pure waste.
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

  // URLs that have reported an outcome at least once. A ref, not state: the
  // latch is write-once per URL and only ever feeds the boolean below.
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
