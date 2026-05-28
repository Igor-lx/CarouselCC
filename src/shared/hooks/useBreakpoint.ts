import { useSyncExternalStore } from "react";

const BREAKPOINTS = {
  DESKTOP: 1024,
  TABLET: 768,
  MOBILE: 0,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

const SORTED = (Object.entries(BREAKPOINTS) as [Breakpoint, number][]).sort(
  (a, b) => b[1] - a[1],
);

let current: Breakpoint = "MOBILE";
let initialized = false;
const queries = new Map<Breakpoint, MediaQueryList>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

const resolve = (): Breakpoint => {
  for (const [key] of SORTED) {
    if (queries.get(key)?.matches) return key;
  }
  return "MOBILE";
};

const onChange = () => {
  const next = resolve();
  if (next !== current) {
    current = next;
    notify();
  }
};

const subscribe = (callback: () => void) => {
  listeners.add(callback);

  if (!initialized && typeof window !== "undefined") {
    SORTED.forEach(([key, value]) => {
      const query = window.matchMedia(`(min-width: ${value}px)`);
      queries.set(key, query);
      query.addEventListener("change", onChange);
    });
    current = resolve();
    initialized = true;
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      queries.forEach((query) => query.removeEventListener("change", onChange));
      queries.clear();
      initialized = false;
    }
  };
};

const getSnapshot = () => current;
const getServerSnapshot = (): Breakpoint => "MOBILE";

export function useBreakpoint<T>(values: Partial<Record<Breakpoint, T>> & { DEFAULT: T }): T {
  const active = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return values[active] ?? values.DEFAULT;
}
