import { useSyncExternalStore } from "react";

/**
 * Minimal shape of the non-standard `navigator.connection` (Network
 * Information API). Only `saveData` and its change events are needed; the
 * rest of the surface is intentionally not modeled.
 */
interface NetworkInformationLike extends EventTarget {
  readonly saveData?: boolean;
}

const readConnection = (): NetworkInformationLike | null => {
  if (typeof navigator === "undefined") return null;
  const candidate = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;
  return candidate ?? null;
};

let prefersReducedData = false;
let saveDataEnabled = false;
let initialized = false;
let reducedDataQuery: MediaQueryList | null = null;
let connection: NetworkInformationLike | null = null;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());

/**
 * Live read of BOTH signals; the MediaQueryList and the connection handle are
 * created once and reused. `saveDataEnabled` is recomputed from scratch every
 * time, so an environment without `navigator.connection` can never keep a
 * stale value.
 */
const read = (): void => {
  if (typeof window === "undefined") return;
  reducedDataQuery ??= window.matchMedia("(prefers-reduced-data: reduce)");
  prefersReducedData = reducedDataQuery.matches;
  connection ??= readConnection();
  saveDataEnabled = Boolean(connection?.saveData);
};

const onReducedDataChange = (event: MediaQueryListEvent): void => {
  if (prefersReducedData === event.matches) return;
  prefersReducedData = event.matches;
  notify();
};

const onConnectionChange = (): void => {
  const next = Boolean(connection?.saveData);
  if (saveDataEnabled === next) return;
  saveDataEnabled = next;
  notify();
};

const subscribe = (callback: () => void): (() => void) => {
  listeners.add(callback);

  // Gated on the subscriber COUNT, not on whether the MediaQueryList exists: a
  // re-subscribe after a full teardown must re-attach both change listeners and
  // re-sync from the live values.
  if (listeners.size === 1 && typeof window !== "undefined") {
    read();
    initialized = true;
    reducedDataQuery?.addEventListener("change", onReducedDataChange);
    connection?.addEventListener("change", onConnectionChange);
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size > 0) return;
    reducedDataQuery?.removeEventListener("change", onReducedDataChange);
    connection?.removeEventListener("change", onConnectionChange);
    // Dormant: nothing keeps the values fresh any more, so force the next
    // consumer (subscribe OR a render-time getSnapshot) to re-read.
    initialized = false;
  };
};

/**
 * Snapshot when reduced-data observation is active — with a LAZY LIVE read on
 * the first call: React reads the snapshot during render, BEFORE it subscribes.
 * Returning the cached `false` there reported "data-saver off" for the whole
 * first frame — which is the very frame the off-band image fetch policy is
 * decided in, so a data-saving user could still eat the speculative requests.
 */
const getSnapshot = (): boolean => {
  if (!initialized) {
    read();
    initialized = true;
  }
  return prefersReducedData || saveDataEnabled;
};

/**
 * Neutral snapshot used both for SSR/hydration and for the disabled hook —
 * in either case there is no observed signal, so data-saving reads as off.
 */
const getNeutralSnapshot = (): boolean => false;

/** No-op subscription for the disabled hook: never touches the store. */
const noopSubscribe = (): (() => void) => () => undefined;

/**
 * Reports whether the user has opted into reduced data usage — via the
 * `prefers-reduced-data` media query or the Network Information API's
 * `saveData` flag. Backed by `useSyncExternalStore`, which handles the
 * SSR/hydration snapshot split natively.
 *
 * Pass `enabled = false` to call the hook unconditionally (Rules of Hooks)
 * without subscribing to the store — for callers whose feature is itself
 * inactive, so they would never act on the result anyway.
 *
 * Intended only to skip *speculative* network work (e.g. image warm-up). It
 * must never gate correctness-critical work — error handling, retry, or
 * anything the user actually sees.
 */
export function useDataSaver(enabled = true): boolean {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getSnapshot : getNeutralSnapshot,
    getNeutralSnapshot,
  );
}
