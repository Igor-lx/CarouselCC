import { useState, useSyncExternalStore } from "react";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

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

export function useIsReducedMotion(): boolean {
  const [mounted, setMounted] = useState(false);
  const detected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useIsomorphicLayoutEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? detected : false;
}
