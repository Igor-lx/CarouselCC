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

  // Gated on the subscriber COUNT, not on whether the MediaQueryList exists: a
  // re-subscribe after a full teardown must re-attach the change listener and
  // re-sync from the live value.
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
      // Dormant: nothing keeps the value fresh any more, so force the next
      // consumer (subscribe OR a render-time getSnapshot) to re-read.
      initialized = false;
    }
  };
};

/**
 * LAZY LIVE read on the first call: React reads the snapshot during render,
 * BEFORE it subscribes. Returning a cached `false` there reported "not a touch
 * device" for the whole first frame on every phone — and any consumer that
 * latched that first value (e.g. `useState(isTouch)`) stayed wrong for good.
 */
const getSnapshot = () => {
  if (!initialized) {
    isTouch = read();
    initialized = true;
  }
  return isTouch;
};

const getServerSnapshot = () => false;

/**
 * Reports whether the device is touch-first. Backed by `useSyncExternalStore`,
 * which handles the SSR/hydration snapshot split natively via
 * `getServerSnapshot` — no manual mount gate needed.
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
