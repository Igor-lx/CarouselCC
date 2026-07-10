import { useMediaQuery } from "./useMediaQuery";

const BREAKPOINTS = {
  DESKTOP: 1024,
  TABLET: 768,
  MOBILE: 0,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Resolves a value for the active width breakpoint. Built on the shared
 * `useMediaQuery` store — one `min-width` listener per tier, shared across
 * every consumer (SSR resolves to MOBILE via the `false` snapshots).
 */
export function useBreakpoint<T>(
  values: Partial<Record<Breakpoint, T>> & { DEFAULT: T }
): T {
  const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.DESKTOP}px)`);
  const isTablet = useMediaQuery(`(min-width: ${BREAKPOINTS.TABLET}px)`);
  const active: Breakpoint = isDesktop
    ? "DESKTOP"
    : isTablet
    ? "TABLET"
    : "MOBILE";
  return values[active] ?? values.DEFAULT;
}
