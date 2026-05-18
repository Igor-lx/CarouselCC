import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

/**
 * Owns the image-resource store for the lifetime of a Carousel instance.
 *
 * The store is created lazily and *only when `enabled`* — i.e. only when the
 * carousel renders image content (`isContentImg`). While `enabled` is false
 * nothing is allocated and `null` is returned: no store, no maps, no timers,
 * no fetches, no decodes. Once created the store is kept even if a later
 * render turns `enabled` back off, avoiding lifecycle churn; the retained
 * store is disposed on unmount, which releases every offscreen image, retry
 * timer, and idle callback.
 */
export function useImageResourceStoreInstance(
  enabled: boolean,
): ImageResourceStore | null {
  const storeRef = useRef<ImageResourceStore | null>(null);

  if (enabled && storeRef.current === null) {
    storeRef.current = createImageResourceStore();
  }

  useEffect(
    () => () => {
      storeRef.current?.dispose();
    },
    [],
  );

  return storeRef.current;
}
