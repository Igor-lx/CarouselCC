import { useMediaQuery } from "../../shared/useMediaQuery";

/** Landscape AND short in HEIGHT (a handheld held sideways) — max-height, not width. */
export const SHORT_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 520px)";

export function useShortLandscape(): boolean {
  return useMediaQuery(SHORT_LANDSCAPE_QUERY);
}
