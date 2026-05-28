import { useCallback, useMemo, useSyncExternalStore } from "react";

import type {
  ImageResourceSnapshot,
  ImageResourceStore,
  ImageStatus,
} from "./types";

/**
 * One slide's view of its image resource: the reactive snapshot plus the
 * bound callbacks it uses to report outcomes and request retries. The
 * callbacks are stable for a given URL.
 */
export interface ImageResourceHandle {
  readonly status: ImageStatus;
  readonly generation: number;
  /** Report a successful on-screen `<img>` load. */
  readonly reportLoaded: () => void;
  /** Report a failed on-screen `<img>` load. */
  readonly reportError: () => void;
  /** Ask the store to retry this URL (deduped + backed off internally). */
  readonly requestRetry: () => void;
}

/**
 * Snapshot for an untracked slide — a non-image slide, or any slide while
 * `isContentImg` is off (no store). Treated as permanently ready.
 */
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

/**
 * Subscribes a slide to its image resource.
 *
 * The store is passed in explicitly (not pulled from context), so the slide's
 * data dependency is visible in source — consistent with how the rest of the
 * carousel threads its per-instance singletons. Pass `null` for `url` on
 * non-image slides; `store` is also `null` for the whole carousel when
 * `isContentImg` is off. In either case the hook short-circuits to
 * `READY_SNAPSHOT` with no-op callbacks and never touches a store — no
 * subscription, no allocation, no work. The call stays unconditional, so the
 * Rules of Hooks hold whatever the slide content is.
 *
 * When tracked, the hook is backed by `useSyncExternalStore`, so the slide
 * re-renders precisely when *its own* URL changes status.
 */
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

  // Callbacks depend only on (store, url) — kept stable across status changes
  // so a consumer effect keyed on `requestRetry` does not re-run on every load.
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
    [snapshot, callbacks],
  );
}
