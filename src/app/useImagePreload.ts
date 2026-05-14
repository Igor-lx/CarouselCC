import { useEffect, useRef } from "react";

const FALLBACK_IDLE_DELAY_MS = 250;
const MIN_IDLE_BUDGET_MS = 12;

interface ImagePreloadOptions {
  /** When false, the hook performs no work (use for "wait until carousel idle"). */
  enabled?: boolean;
  /**
   * When true (default), the hook calls `image.decode()` during browser idle
   * after each image has loaded. The decoded bitmap is then ready when the
   * carousel actually displays it, avoiding a paint-time decode hitch.
   * When false, the hook only kicks off downloads — useful in environments
   * where `requestIdleCallback` is unavailable or unreliable.
   */
  decode?: boolean;
}

interface ImagePreloadRecord {
  image: HTMLImageElement;
  load: Promise<HTMLImageElement>;
  decoded: boolean;
}

const scheduleIdle = (
  callback: () => void,
  minBudgetMs = MIN_IDLE_BUDGET_MS,
) => {
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
        if (deadline.timeRemaining() < minBudgetMs) {
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
    }, FALLBACK_IDLE_DELAY_MS);
  };

  schedule();

  return () => {
    disposed = true;
    clearScheduled();
  };
};

const canDecodeDuringIdle = () =>
  typeof window.requestIdleCallback === "function";

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

    cancelScheduled = scheduleIdle(() => {
      finish();
    });

    cancel = () => {
      cancelScheduled();
      finish();
    };

    pendingCancels.add(cancel);
  });

const startImageLoad = (src: string): ImagePreloadRecord => {
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

    if (image.complete) {
      finish();
    }
  });

  return { image, load, decoded: false };
};

const decodeLoadedImage = (image: HTMLImageElement): Promise<void> => {
  if (typeof image.decode !== "function") return Promise.resolve();
  return image.decode().then(
    () => undefined,
    () => undefined,
  );
};

const toOptions = (
  options: boolean | ImagePreloadOptions,
): Required<ImagePreloadOptions> => {
  if (typeof options === "boolean") {
    return { enabled: options, decode: true };
  }
  return {
    enabled: options.enabled ?? true,
    decode: options.decode ?? true,
  };
};

/**
 * Two-phase image preloader.
 *
 * Phase 1 (eager, synchronous in the effect): kick off `new Image().src`
 * for every unique URL with `fetchPriority="low"`. The browser starts
 * downloading immediately on its idle network lane.
 *
 * Phase 2 (idle, sequential): once each image's load promise resolves,
 * wait for a fat idle window and call `image.decode()`. Decoding the
 * bitmap on the idle thread means when the carousel actually displays the
 * slide there's no paint-time decode hitch.
 *
 * The `enabled` switch is the consumer's "carousel is idle" gate: pass
 * `false` while motion is running to keep the decode loop from competing
 * with the motion RAF for main-thread budget.
 */
export function useImagePreload(
  urls: readonly string[],
  options: boolean | ImagePreloadOptions = {},
): void {
  const { enabled, decode } = toOptions(options);
  const cacheRef = useRef(new Map<string, ImagePreloadRecord>());

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    let cancelled = false;
    const pendingCancels = new Set<() => void>();
    const uniqueUrls = [...new Set(urls)];
    const activeUrls = new Set(uniqueUrls);

    cacheRef.current.forEach((_, src) => {
      if (!activeUrls.has(src)) {
        cacheRef.current.delete(src);
      }
    });

    const run = async () => {
      uniqueUrls.forEach((src) => {
        const cached = cacheRef.current.get(src);
        if (cached) return;

        const record = startImageLoad(src);
        cacheRef.current.set(src, record);
      });

      if (!decode || !canDecodeDuringIdle()) return;

      for (const src of uniqueUrls) {
        if (cancelled) break;

        const record = cacheRef.current.get(src);
        if (!record || record.decoded) continue;

        const image = await record.load;
        if (cancelled) break;

        await waitForIdle(pendingCancels);
        if (cancelled) break;

        await decodeLoadedImage(image);
        record.decoded = true;
      }
    };

    void run();

    return () => {
      cancelled = true;
      pendingCancels.forEach((cancel) => cancel());
      pendingCancels.clear();
    };
  }, [decode, enabled, urls]);
}
