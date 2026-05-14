import { useEffect, useRef } from "react";

const scheduleIdle = (callback: () => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 1000 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
};

const decodeImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve(image);
    };

    image.decoding = "async";
    const decode = () => {
      if (typeof image.decode !== "function") {
        finish();
        return;
      }
      image.decode().then(finish, finish);
    };

    image.onload = decode;
    image.onerror = finish;
    image.src = src;

    if (image.complete) {
      decode();
    }
  });

export function useImagePreload(urls: readonly string[]): void {
  const cacheRef = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    if (typeof window === "undefined") return;

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

        await new Promise<void>((resolve) => {
          let cancel: () => void = () => undefined;
          cancel = scheduleIdle(() => {
            pendingCancels.delete(cancel);
            resolve();
          });
          pendingCancels.add(cancel);
        });

        if (cancelled) break;
        const image = await decodeImage(src);
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
  }, [urls]);
}
