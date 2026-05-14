import { useEffect, useRef } from "react";

const FALLBACK_IDLE_DELAY_MS = 250;
const MIN_IDLE_BUDGET_MS = 12;

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
        if (deadline.timeRemaining() < MIN_IDLE_BUDGET_MS) {
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
    let cancel: () => void = () => undefined;
    cancel = scheduleIdle(() => {
      pendingCancels.delete(cancel);
      resolve();
    });
    pendingCancels.add(cancel);
  });

const loadImage = (
  src: string,
  pendingCancels: Set<() => void>,
): Promise<HTMLImageElement> =>
  new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      pendingCancels.delete(cancel);
      resolve(image);
    };

    const cancel = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      pendingCancels.delete(cancel);
      resolve(image);
    };

    pendingCancels.add(cancel);
    image.decoding = "async";
    image.fetchPriority = "low";

    image.onload = finish;
    image.onerror = finish;
    image.src = src;

    if (image.complete) {
      finish();
    }
  });

const decodeLoadedImage = (image: HTMLImageElement): Promise<void> => {
  if (typeof image.decode !== "function") return Promise.resolve();
  return image.decode().then(
    () => undefined,
    () => undefined,
  );
};

export function useImagePreload(urls: readonly string[], enabled = true): void {
  const cacheRef = useRef(new Map<string, HTMLImageElement>());

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
      for (const src of uniqueUrls) {
        if (cancelled || cacheRef.current.has(src)) continue;

        await waitForIdle(pendingCancels);
        if (cancelled) break;

        const image = await loadImage(src, pendingCancels);
        if (cancelled) break;

        if (canDecodeDuringIdle()) {
          await waitForIdle(pendingCancels);
          if (cancelled) break;
          await decodeLoadedImage(image);
        }

        if (!cancelled) {
          cacheRef.current.set(src, image);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      pendingCancels.forEach((cancel) => cancel());
      pendingCancels.clear();
    };
  }, [enabled, urls]);
}
