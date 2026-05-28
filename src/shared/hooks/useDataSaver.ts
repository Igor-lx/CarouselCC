import { useSyncExternalStore } from "react";

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
let reducedDataQuery: MediaQueryList | null = null;
let connection: NetworkInformationLike | null = null;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());

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

  if (reducedDataQuery === null && typeof window !== "undefined") {
    reducedDataQuery = window.matchMedia("(prefers-reduced-data: reduce)");
    prefersReducedData = reducedDataQuery.matches;
    reducedDataQuery.addEventListener("change", onReducedDataChange);

    connection = readConnection();
    if (connection) {
      saveDataEnabled = Boolean(connection.saveData);
      connection.addEventListener("change", onConnectionChange);
    }
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size > 0 || reducedDataQuery === null) return;
    reducedDataQuery.removeEventListener("change", onReducedDataChange);
    connection?.removeEventListener("change", onConnectionChange);
    reducedDataQuery = null;
    connection = null;
    prefersReducedData = false;
    saveDataEnabled = false;
  };
};

const getSnapshot = (): boolean => prefersReducedData || saveDataEnabled;

const getNeutralSnapshot = (): boolean => false;

const noopSubscribe = (): (() => void) => () => undefined;

export function useDataSaver(enabled = true): boolean {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getSnapshot : getNeutralSnapshot,
    getNeutralSnapshot,
  );
}
