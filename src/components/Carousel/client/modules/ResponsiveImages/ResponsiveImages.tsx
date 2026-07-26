import { memo, useEffect, useRef } from "react";

import { useCarouselMotion, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import type { ResponsiveImagesProps } from "./types";

const scheduleIdle = (work: () => void): (() => void) => {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => work(), { timeout: 1000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(work, 150);
  return () => window.clearTimeout(handle);
};

/**
 * The responsive-image module — a HEADLESS slot. Its PRESENCE switches the
 * responsive stack on (art-directed sources, srcSet/sizes, rotation veil,
 * portrait flip); its body is the predecode manager. There is deliberately no
 * preload — the render window's mounted `<img>`s ARE the preload. Predecode
 * decodes buffered bitmaps in idle, reading the file from the element's own
 * `currentSrc` (never a re-derived guess). Unmounted, it tree-shakes out. See
 * docs/architecture/modules.md.
 */
const ResponsiveImagesBase = memo(function ResponsiveImages({
  isPredecodeOn = false,
}: ResponsiveImagesProps) {
  const { trackRef, isOffBandFetchOn } = useCarouselStable();
  const { status, intent } = useCarouselMotion();

  // URLs already handed to a decode, pruned to the live buffer on each pass:
  // leaving the window re-arms the URL for a future revisit.
  const decodedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isPredecodeOn) return;
    if (!status.isIdle) return; // decode only while the deck rests
    const track = trackRef.current;
    if (!track) return;

    // The buffered slides: everything the render window mounts OUTSIDE the
    // visible band. The band itself is already on screen — its bitmaps were
    // decoded by the act of painting them.
    const buffered = Array.from(
      track.querySelectorAll<HTMLImageElement>(
        '[data-active-zone="false"] img',
      ),
    );
    if (buffered.length === 0) return;

    const decoded = decodedRef.current;
    const live = new Set(
      buffered.map((image) => image.currentSrc).filter(Boolean),
    );
    for (const url of decoded) if (!live.has(url)) decoded.delete(url);

    const queue: string[] = [];
    let isStopped = false;
    let cancelIdle: (() => void) | null = null;

    const pump = (): void => {
      cancelIdle = null;
      if (isStopped) return;
      const url = queue.shift();
      if (url === undefined) return;
      // A detached copy, decoded and dropped — see `isPredecodeOn`. The URL is
      // already in the HTTP cache (the rendered element fetched it), so this
      // costs no network.
      const image = new Image();
      image.src = url;
      image
        .decode()
        .catch(() => {
          // Broken file, cache eviction race, aborted navigation — all
          // non-events: the slide's own error path owns retries. Re-arm the
          // URL so a later idle pass may try again.
          decoded.delete(url);
        })
        .finally(() => {
          if (!isStopped && queue.length > 0) cancelIdle = scheduleIdle(pump);
        });
    };

    const enqueue = (url: string): void => {
      if (url === "" || decoded.has(url)) return;
      decoded.add(url);
      queue.push(url);
      if (cancelIdle === null && !isStopped) cancelIdle = scheduleIdle(pump);
    };

    // `currentSrc` is empty until the element has selected and begun loading,
    // so an element that is not there yet is picked up by its own `load`
    // rather than guessed at or polled.
    const detachListeners: Array<() => void> = [];
    for (const image of buffered) {
      if (image.complete && image.currentSrc !== "") {
        enqueue(image.currentSrc);
        continue;
      }
      const onLoad = (): void => enqueue(image.currentSrc);
      image.addEventListener("load", onLoad, { once: true });
      detachListeners.push(() => image.removeEventListener("load", onLoad));
    }

    return () => {
      isStopped = true;
      cancelIdle?.();
      for (const detach of detachListeners) detach();
    };
  }, [
    // The buffer's elements mount when the bandwidth gate opens, and change
    // when the deck settles somewhere new — the two moments there is anything
    // new to decode.
    intent.targetPageIndex,
    isOffBandFetchOn,
    isPredecodeOn,
    status.isIdle,
    trackRef,
  ]);

  return null;
});

export const ResponsiveImages: CarouselSlotComponent<
  typeof ResponsiveImagesBase,
  "responsive-images"
> = Object.assign(ResponsiveImagesBase, { slot: "responsive-images" as const });
