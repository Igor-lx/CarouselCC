import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

/**
 * Owns the image-resource store for the lifetime of a Carousel instance.
 *
 * Created lazily, only once the carousel first renders image content
 * (`enabled`). The returned value is the store **only while `enabled`** and
 * `null` otherwise — so the contract matches the `ImageResourceStore | null`
 * type at every call site (with image content off, consumers get `null` and do
 * no work).
 *
 * The retained ref is a separate concern from the returned value: when
 * `enabled` flips false the store is *soft-disposed* (retry timers released,
 * maps cleared) but the ref is deliberately kept, because `dispose()` leaves
 * the instance usable. A later re-enable — or a React StrictMode
 * unmount/remount — therefore reuses the same store (re-populated by the slides
 * as they re-subscribe) instead of churning a fresh one.
 */
export function useImageResourceStoreInstance(
  enabled: boolean,
): ImageResourceStore | null {
  const storeRef = useRef<ImageResourceStore | null>(null);

  if (enabled && storeRef.current === null) {
    storeRef.current = createImageResourceStore();
  }

  // When image content is turned off, soft-dispose so retry timers are freed.
  // The ref is kept (see above) for cheap reuse on a later re-enable / remount.
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
