import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

/**
 * Owns the image-resource store for the lifetime of a Carousel instance.
 *
 * The store is created lazily and *only when `enabled`* — i.e. only when the
 * carousel renders image content (`isContentImg`). While `enabled` is false
 * nothing is allocated and `null` is returned: no store, no maps, no timers,
 * no fetches, no decodes. Once created the store is kept (a later
 * `isContentImg` toggle does not churn it).
 *
 * The cleanup `dispose()`s the store. `dispose()` is a *soft* reset — it frees
 * every heavyweight resource but the instance stays usable — so the ref is
 * deliberately NOT nulled: a React StrictMode unmount/remount reuses the same
 * store (re-populated by the re-run preload/observe effects) instead of
 * swapping in a fresh one, which would lose accumulated render status.
 */
export function useImageResourceStoreInstance(
  enabled: boolean,
): ImageResourceStore | null {
  const storeRef = useRef<ImageResourceStore | null>(null);

  if (enabled && storeRef.current === null) {
    storeRef.current = createImageResourceStore();
  }

  // When image content is turned off, soft-dispose the store so its retry
  // timers are released. `dispose()` keeps the instance usable, and the ref is
  // deliberately NOT nulled, so a later re-enable (or a StrictMode remount)
  // reuses the same store instead of churning a fresh one.
  useEffect(() => {
    if (!enabled) storeRef.current?.dispose();
  }, [enabled]);

  useEffect(
    () => () => {
      storeRef.current?.dispose();
    },
    [],
  );

  return storeRef.current;
}
