import { useMediaQuery } from "./useMediaQuery";

/** The canonical portrait condition — the one string every leg of an
 * orientation contract (CSS-facing data, diagnostics) should reuse. */
export const PORTRAIT_ORIENTATION_QUERY = "(orientation: portrait)";

/** Canonical landscape condition — the complement, for CSS-facing data. */
export const LANDSCAPE_ORIENTATION_QUERY = "(orientation: landscape)";

export type ViewportOrientation = "portrait" | "landscape";

/**
 * The viewport orientation as a NAME. Pure aspect of the viewport (is the
 * height greater than the width) — nothing about device class or size;
 * contrast `useCompactLandscape`, which is landscape AND a short viewport
 * (a handheld held sideways). A desktop monitor is `landscape` here but
 * never compact-landscape.
 */
export function useOrientation(): ViewportOrientation {
  return useMediaQuery(PORTRAIT_ORIENTATION_QUERY) ? "portrait" : "landscape";
}
