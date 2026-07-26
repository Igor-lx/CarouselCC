// See docs/architecture/modules.md
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

// Headless slot: presence switches the responsive stack on; body is the
// predecode manager (no preload — the mounted <img>s are the preload).
const ResponsiveImagesBase = memo(function ResponsiveImages({
  isPredecodeOn = false,
}: ResponsiveImagesProps) {
  const { trackRef, isOffBandFetchOn } = useCarouselStable();
  const { status, intent } = useCarouselMotion();

  // URLs already handed to a decode, pruned to the live buffer each pass.
  const decodedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isPredecodeOn) return;
    if (!status.isIdle) return; // decode only while the deck rests
    const track = trackRef.current;
    if (!track) return;

    // The buffered slides — mounted outside the visible band (the band's
    // bitmaps decoded by being painted).
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
      // A detached copy, decoded and dropped; the URL is already cached, so no network.
      const image = new Image();
      image.src = url;
      image
        .decode()
        .catch(() => {
          decoded.delete(url); // re-arm; the slide's own error path owns retries
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

    // currentSrc is empty until the element begins loading, so pick it up via `load`.
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
    // Re-run when the buffer mounts (gate opens) or the deck settles anew.
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
