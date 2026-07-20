import { useActiveBreakpoint } from "./useActiveBreakpoint";

const BREAKPOINTS = {
  DESKTOP: 1024,
  TABLET: 768,
  MOBILE: 0,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Resolves a value for the active width breakpoint of the app-generic tier
 * set (DESKTOP/TABLET/MOBILE). A thin naming layer over
 * `useActiveBreakpoint` — same numeric resolution, same shared listeners
 * (SSR resolves to MOBILE via the `false` snapshots). Consumers that need
 * CUSTOM tier names/thresholds use `useActiveBreakpoint` with their own
 * table instead.
 */
export function useBreakpoint<T>(
  values: Partial<Record<Breakpoint, T>> & { DEFAULT: T }
): T {
  const active = useActiveBreakpoint(BREAKPOINTS) as Breakpoint;
  return values[active] ?? values.DEFAULT;
}
