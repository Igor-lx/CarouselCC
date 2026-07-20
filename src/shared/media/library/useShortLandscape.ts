import { useMediaQuery } from "./useMediaQuery";

/**
 * A SHORT landscape viewport — landscape AND limited in HEIGHT. The
 * distinguishing axis is `max-height` (NOT width): a handheld held sideways
 * is landscape but only a few hundred px tall, whereas a desktop monitor is
 * also landscape yet plenty tall. Neither orientation alone nor a width
 * breakpoint can express this — hence a dedicated height condition.
 *
 * `520px` is a sensible default ceiling. Exported as a constant so JS
 * consumers and any CSS/media usage share the exact same condition.
 */
export const SHORT_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 520px)";

/**
 * Reports whether the viewport is a short landscape (see
 * {@link SHORT_LANDSCAPE_QUERY}). A generic ergonomics primitive: hosts use
 * it to pick a layout that fits a short, wide handheld screen — e.g. a
 * different visible-slides count. A pure media-query signal on the shared
 * `useMediaQuery` store.
 */
export function useShortLandscape(): boolean {
  return useMediaQuery(SHORT_LANDSCAPE_QUERY);
}
