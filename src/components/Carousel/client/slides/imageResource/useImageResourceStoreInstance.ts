// See docs/architecture/slides.md
import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

/** Owns the store for the carousel's lifetime; lazily created, `null` while
 * image content is off, soft-disposed but ref-retained for reuse. */
export function useImageResourceStoreInstance(
  enabled: boolean,
): ImageResourceStore | null {
  const storeRef = useRef<ImageResourceStore | null>(null);

  if (enabled && storeRef.current === null) {
    storeRef.current = createImageResourceStore();
  }

  // Soft-dispose when content turns off; the ref is kept for cheap reuse.
  useEffect(() => {
    if (!enabled) storeRef.current?.dispose();
  }, [enabled]);

  useEffect(
    () => () => {
      storeRef.current?.dispose();
    },
    [],
  );

  return enabled ? storeRef.current : null;
}
