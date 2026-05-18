import { useSyncExternalStore } from "react";

let isReduced = false;
let mediaQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

const onChange = (event: MediaQueryListEvent) => {
  if (isReduced !== event.matches) {
    isReduced = event.matches;
    notify();
  }
};

const subscribe = (callback: () => void) => {
  listeners.add(callback);

  if (!mediaQuery && typeof window !== "undefined") {
    mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    isReduced = mediaQuery.matches;
    mediaQuery.addEventListener("change", onChange);
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", onChange);
      mediaQuery = null;
    }
  };
};

const getSnapshot = () => isReduced;
const getServerSnapshot = () => false;

/**
 * Reports the `prefers-reduced-motion` setting. Backed by
 * `useSyncExternalStore`, which handles the SSR/hydration snapshot split
 * natively via `getServerSnapshot` — no manual mount gate needed.
 */
export function useIsReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
