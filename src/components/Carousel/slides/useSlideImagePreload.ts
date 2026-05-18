import { useEffect, useMemo, useRef } from "react";

import {
  loopedSlideIndex,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";

const PRELOAD_NEIGHBOUR_RADIUS = 3;
const IDLE_DECODE_MIN_BUDGET_MS = 12;
const IDLE_DECODE_FALLBACK_DELAY_MS = 160;

interface UseSlideImagePreloadInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  isIdle: boolean;
  isContentImg: boolean;
}

interface ImagePreparationRecord {
  image: HTMLImageElement;
  load: Promise<HTMLImageElement>;
  decoded: boolean;
}

const slideImageSource = (record: CarouselSlideRecord): string | null =>
  typeof record.slideData.content === "string" ? record.slideData.content : null;

const unique = (urls: string[]) => [...new Set(urls)];

const collectDeckImageUrls = (records: CarouselSlideRecord[]) =>
  unique(records.map(slideImageSource).filter((src): src is string => src !== null));

const finiteWindowIndex = (
  virtualIndex: number,
  recordCount: number,
): number | null => {
  if (recordCount <= 0 || virtualIndex < 0 || virtualIndex >= recordCount) {
    return null;
  }
  return virtualIndex;
};

const collectPreloadWindowUrls = ({
  records,
  layout,
  currentVirtualIndex,
}: Pick<
  UseSlideImagePreloadInput,
  "records" | "layout" | "currentVirtualIndex"
>) => {
  const recordCount = records.length;
  if (recordCount === 0) return [];

  const current = Math.round(currentVirtualIndex);
  const first = current - PRELOAD_NEIGHBOUR_RADIUS;
  const last =
    current + layout.visibleSlidesCount - 1 + PRELOAD_NEIGHBOUR_RADIUS;
  const urls: string[] = [];

  for (let virtualIndex = first; virtualIndex <= last; virtualIndex += 1) {
    const recordIndex = layout.isFinite
      ? finiteWindowIndex(virtualIndex, recordCount)
      : loopedSlideIndex(virtualIndex, recordCount);

    if (recordIndex === null) continue;
    const src = slideImageSource(records[recordIndex]!);
    if (src) urls.push(src);
  }

  return unique(urls);
};

const createImagePreparationRecord = (src: string): ImagePreparationRecord => {
  const image = new Image();
  const load = new Promise<HTMLImageElement>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve(image);
    };

    image.decoding = "async";
    image.fetchPriority = "low";
    image.onload = finish;
    image.onerror = finish;
    image.src = src;

    if (image.complete) finish();
  });

  return { image, load, decoded: false };
};

const scheduleIdle = (callback: () => void) => {
  let disposed = false;
  let idleHandle: number | null = null;
  let timeoutHandle: number | null = null;

  const clearScheduled = () => {
    if (idleHandle !== null) {
      window.cancelIdleCallback?.(idleHandle);
      idleHandle = null;
    }
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const schedule = () => {
    clearScheduled();

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback((deadline) => {
        idleHandle = null;
        if (disposed) return;
        if (deadline.timeRemaining() < IDLE_DECODE_MIN_BUDGET_MS) {
          schedule();
          return;
        }
        callback();
      });
      return;
    }

    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = null;
      if (!disposed) callback();
    }, IDLE_DECODE_FALLBACK_DELAY_MS);
  };

  schedule();

  return () => {
    disposed = true;
    clearScheduled();
  };
};

const waitForIdle = (pendingCancels: Set<() => void>) =>
  new Promise<void>((resolve) => {
    let disposed = false;
    let cancelScheduled: () => void = () => undefined;
    let cancel: () => void = () => undefined;

    const finish = () => {
      if (disposed) return;
      disposed = true;
      pendingCancels.delete(cancel);
      resolve();
    };

    cancelScheduled = scheduleIdle(finish);
    cancel = () => {
      cancelScheduled();
      finish();
    };

    pendingCancels.add(cancel);
  });

const decodeImage = (image: HTMLImageElement): Promise<void> => {
  if (typeof image.decode !== "function") return Promise.resolve();
  return image.decode().then(
    () => undefined,
    () => undefined,
  );
};

const pruneCache = (
  cache: Map<string, ImagePreparationRecord>,
  allowedUrls: readonly string[],
) => {
  const allowed = new Set(allowedUrls);
  cache.forEach((_, src) => {
    if (!allowed.has(src)) cache.delete(src);
  });
};

/**
 * Prepares image slides near the idle viewport without participating in
 * carousel semantics. The hook starts work on mount (initial state is idle)
 * and after later movements only while the carousel is idle.
 */
export function useSlideImagePreload({
  records,
  layout,
  currentVirtualIndex,
  isIdle,
  isContentImg,
}: UseSlideImagePreloadInput): void {
  const cacheRef = useRef(new Map<string, ImagePreparationRecord>());

  const deckUrls = useMemo(
    () => (isContentImg ? collectDeckImageUrls(records) : []),
    [isContentImg, records],
  );

  const preloadUrls = useMemo(
    () =>
      isContentImg
        ? collectPreloadWindowUrls({ records, layout, currentVirtualIndex })
        : [],
    [currentVirtualIndex, isContentImg, layout, records],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isContentImg) {
      cacheRef.current.clear();
      return;
    }

    pruneCache(cacheRef.current, deckUrls);
  }, [deckUrls, isContentImg]);

  useEffect(() => {
    if (typeof window === "undefined" || !isContentImg || !isIdle) return;
    if (preloadUrls.length === 0) return;

    let cancelled = false;
    const pendingCancels = new Set<() => void>();

    const recordsToPrepare = preloadUrls.map((src) => {
      const cached = cacheRef.current.get(src);
      if (cached) return cached;

      const record = createImagePreparationRecord(src);
      cacheRef.current.set(src, record);
      return record;
    });

    const decodePreparedImages = async () => {
      for (const record of recordsToPrepare) {
        if (cancelled || record.decoded) continue;

        const image = await record.load;
        if (cancelled) break;

        await waitForIdle(pendingCancels);
        if (cancelled) break;

        await decodeImage(image);
        record.decoded = true;
      }
    };

    void decodePreparedImages();

    return () => {
      cancelled = true;
      pendingCancels.forEach((cancel) => cancel());
      pendingCancels.clear();
    };
  }, [isContentImg, isIdle, preloadUrls]);
}
