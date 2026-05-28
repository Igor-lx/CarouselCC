import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

/**
 * Owns the compact image-resource store for one Carousel instance. The store
 * is created only when image content is enabled; otherwise no image-status
 * bookkeeping is allocated.
 */
export function useImageResourceStoreInstance(
  enabled: boolean,
): ImageResourceStore | null {
  const storeRef = useRef<ImageResourceStore | null>(null);

  if (enabled && storeRef.current === null) {
    storeRef.current = createImageResourceStore();
  }

  useEffect(() => {
    if (!enabled) {
      storeRef.current?.dispose();
      storeRef.current = null;
    }
  }, [enabled]);

  useEffect(
    () => () => {
      storeRef.current?.dispose();
      storeRef.current = null;
    },
    [],
  );

  return enabled ? storeRef.current : null;
}
