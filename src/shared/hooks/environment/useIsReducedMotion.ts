import { useMediaQuery } from "../media/useMediaQuery";

/**
 * Reports the `prefers-reduced-motion` setting. A pure media-query signal,
 * expressed through the shared `useMediaQuery` store (one listener per query
 * across the app; SSR-safe `false` snapshot).
 */
export function useIsReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
