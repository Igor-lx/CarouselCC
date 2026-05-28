import { useCallback, useMemo, useSyncExternalStore } from "react";

import type {
  ImageResourceSnapshot,
  ImageResourceStore,
  ImageStatus,
} from "./types";

export interface ImageResourceHandle {
  readonly status: ImageStatus;
  readonly generation: number;
  readonly reportLoaded: () => void;
  readonly reportError: () => void;
  readonly requestRetry: () => void;
}

const READY_SNAPSHOT: ImageResourceSnapshot = Object.freeze({
  status: "loaded",
  generation: 0,
});

const noop = (): void => undefined;
const noopUnsubscribe = (): (() => void) => noop;
const STATIC_CALLBACKS = Object.freeze({
  reportLoaded: noop,
  reportError: noop,
  requestRetry: noop,
});

export function useImageResource(
  url: string | null,
  store: ImageResourceStore | null,
): ImageResourceHandle {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      store !== null && url !== null
        ? store.subscribe(url, onStoreChange)
        : noopUnsubscribe(),
    [store, url],
  );

  const getSnapshot = useCallback(
    () =>
      store !== null && url !== null
        ? store.getSnapshot(url)
        : READY_SNAPSHOT,
    [store, url],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const callbacks = useMemo(
    () =>
      store !== null && url !== null
        ? {
            reportLoaded: () => store.reportLoaded(url),
            reportError: () => store.reportError(url),
            requestRetry: () => store.requestRetry(url),
          }
        : STATIC_CALLBACKS,
    [store, url],
  );

  return useMemo<ImageResourceHandle>(
    () => ({
      status: snapshot.status,
      generation: snapshot.generation,
      ...callbacks,
    }),
    [callbacks, snapshot.generation, snapshot.status],
  );
}
