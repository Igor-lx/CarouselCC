import { useSyncExternalStore } from "react";

let isTouch = false;
let initialized = false;
let mediaQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((l) => l());
};

/** Live read of the coarse-pointer signal; the MediaQueryList is made once. */
const read = (): boolean => {
  if (typeof window === "undefined") return false;
  mediaQuery ??= window.matchMedia("(pointer: coarse)");
  return mediaQuery.matches;
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

  // Count-gated: re-subscribe after teardown must re-attach + re-sync (see README).
  if (listeners.size === 1 && typeof window !== "undefined") {
    isTouch = read();
    initialized = true;
    mediaQuery?.addEventListener("change", onMediaChange);

    if (!isTouch) {
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
    }
  }

  return () => {
    listeners.delete(callback);

    if (listeners.size === 0) {
      mediaQuery?.removeEventListener("change", onMediaChange);
      window.removeEventListener("pointerdown", onPointerDown);
      initialized = false; // dormant → next consumer re-reads live
    }
  };
};

// Lazy live read: a cached `false` would be wrong the whole first frame — and a
// latched consumer (useState(isTouch)) forever. See ../README.md
const getSnapshot = () => {
  if (!initialized) {
    isTouch = read();
    initialized = true;
  }
  return isTouch;
};

const getServerSnapshot = () => false;

export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
