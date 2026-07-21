import { useSyncExternalStore } from "react";

let isTouch = false;
let mediaQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((l) => l());
};

const onMediaChange = (event: MediaQueryListEvent) => {
  if (isTouch !== event.matches) {
    isTouch = event.matches;
    notify();
  }
};

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType !== "touch") return;
  if (isTouch) return;
  isTouch = true;
  notify();
  window.removeEventListener("pointerdown", onPointerDown);
};

const subscribe = (callback: () => void) => {
  listeners.add(callback);

  if (typeof window !== "undefined" && !mediaQuery) {
    mediaQuery = window.matchMedia("(pointer: coarse)");
    isTouch = mediaQuery.matches;
    mediaQuery.addEventListener("change", onMediaChange);

    if (!isTouch) {
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
    }
  }

  return () => {
    listeners.delete(callback);

    if (listeners.size === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", onMediaChange);
      window.removeEventListener("pointerdown", onPointerDown);
      mediaQuery = null;
      // Reset to the declared initial state so a later re-subscribe starts
      // clean, mirroring `useDataSaver`'s teardown. The next `subscribe` re-
      // reads `matchMedia`, so this only governs the no-listener gap.
      isTouch = false;
    }
  };
};

const getSnapshot = () => isTouch;
const getServerSnapshot = () => false;

/**
 * Reports whether the device is touch-first. Backed by `useSyncExternalStore`,
 * which handles the SSR/hydration snapshot split natively via
 * `getServerSnapshot` — no manual mount gate needed.
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
