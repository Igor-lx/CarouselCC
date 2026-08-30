import { useSyncExternalStore } from "react";

/** Minimal shape of the non-standard `navigator.connection` (only `saveData`). */
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

const notify = (): void => {
  // Snapshot + membership: a listener that subscribes during this
  // notification must not receive it, and one that unsubscribes during it
  // must not be called after the fact.
  for (const listener of [...listeners]) {
    if (listeners.has(listener)) listener();
  }
};

// Live read of both signals; handles made once, saveData recomputed each time.
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

  // Count-gated: re-subscribe after teardown must re-attach + re-sync (see README).
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
    initialized = false; // dormant → next consumer re-reads live
  };
};

// Lazy live read: a cached `false` on the first frame (when the fetch policy is
// decided) would let a data-saving user eat speculative requests. See ../README.md
const getSnapshot = (): boolean => {
  if (!initialized) {
    read();
    initialized = true;
  }
  return prefersReducedData || saveDataEnabled;
};

// Neutral snapshot for SSR + the disabled hook (no observed signal → off).
const getNeutralSnapshot = (): boolean => false;
const noopSubscribe = (): (() => void) => () => undefined;

// SPECULATIVE work only — never gate correctness. enabled=false skips the store
// (Rules of Hooks) for inactive callers. See ../README.md
export function useDataSaver(enabled = true): boolean {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getSnapshot : getNeutralSnapshot,
    getNeutralSnapshot,
  );
}
