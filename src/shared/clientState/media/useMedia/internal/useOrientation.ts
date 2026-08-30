import { useMediaQuery } from "../../../sharedStore/useMediaQuery";

/** The canonical portrait condition — the one string every leg of an
 * orientation contract (CSS-facing data, diagnostics) should reuse. */
export const PORTRAIT_ORIENTATION_QUERY = "(orientation: portrait)";

/** Canonical landscape condition — the complement, for CSS-facing data. */
export const LANDSCAPE_ORIENTATION_QUERY = "(orientation: landscape)";

export type ViewportOrientation = "portrait" | "landscape";

/** Viewport orientation by aspect only (contrast `useShortLandscape`, which caps height). */
export function useOrientation(): ViewportOrientation {
  return useMediaQuery(PORTRAIT_ORIENTATION_QUERY) ? "portrait" : "landscape";
}
