import { useSyncExternalStore } from "react";

const QUERY = "(orientation: landscape) and (max-height: 520px)";

let isCompact = false;
let mediaQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

const onChange = (event: MediaQueryListEvent) => {
  if (isCompact !== event.matches) {
    isCompact = event.matches;
    notify();
  }
};

const subscribe = (callback: () => void) => {
  listeners.add(callback);

  if (!mediaQuery && typeof window !== "undefined") {
    mediaQuery = window.matchMedia(QUERY);
    isCompact = mediaQuery.matches;
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

const getSnapshot = () => isCompact;
const getServerSnapshot = () => false;

/**
 * Tracks the demo-specific "compact landscape" condition used to pick a
 * different visible-slides count and to fall back to desktop imagery. Shares
 * the `useSyncExternalStore` + module-store pattern of the other media-query
 * hooks (`useIsReducedMotion`, `useIsTouchDevice`, `useBreakpoint`).
 */
export function useCompactLandscape(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
