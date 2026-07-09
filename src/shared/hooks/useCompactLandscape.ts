import { useMediaQuery } from "./useMediaQuery";

/**
 * The "compact landscape" ergonomics condition: a landscape viewport too
 * short for tall content (handheld phones/small tablets held sideways).
 * Kept as one exported constant so JS consumers and any style/media usage
 * can share the exact same condition.
 */
export const COMPACT_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 520px)";

/**
 * Reports whether the viewport is in compact landscape. Complements
 * `useBreakpoint` (which is width-only and cannot express an
 * orientation/height condition): hosts typically use it to pick a layout
 * that fits a short, wide handheld screen — e.g. a different visible-slides
 * count for the carousel. A pure media-query signal on the shared
 * `useMediaQuery` store.
 */
export function useCompactLandscape(): boolean {
  return useMediaQuery(COMPACT_LANDSCAPE_QUERY);
}
