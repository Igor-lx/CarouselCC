import { useEffect, useRef } from "react";

import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

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
