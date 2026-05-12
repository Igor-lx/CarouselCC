import { useEffect, useState, useSyncExternalStore } from "react";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

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
    }
  };
};

const getSnapshot = () => isTouch;
const getServerSnapshot = () => false;

export function useIsTouchDevice(): boolean {
  const [mounted, setMounted] = useState(false);
  const detected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useIsomorphicLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // ensure subscription kept alive across re-renders
  }, []);

  return mounted ? detected : false;
}
