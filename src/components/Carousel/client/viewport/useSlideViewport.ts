import { useMemo } from "react";

import {
  useActiveBreakpoint,
  useCompactLandscape,
  useMediaQuery,
  useOrientation,
  type ViewportOrientation,
} from "../../../../shared";
import {
  SLIDE_CANONICAL_SOURCE_MEDIA,
  SLIDE_VIEWPORT_BREAKPOINTS,
} from "../config/viewport";

/**
 * The carousel's viewport sensor — ONE place that turns the axes declared in
 * `config/viewport.ts` into live values. The root stamps them as data
 * attributes (the styling contract of the component SCSS), the responsive
 * module and the reorientation veil read the same matches for asset choice.
 * Everything is backed by the shared `useMediaQuery` store: one browser
 * listener per distinct condition, no matter how many consumers.
 */

export interface SlideViewport {
  /** Active width-tier NAME from SLIDE_VIEWPORT_BREAKPOINTS. */
  breakpoint: string;
  orientation: ViewportOrientation;
  isCompactLandscape: boolean;
}

export const useSlideViewport = (): SlideViewport => {
  const breakpoint = useActiveBreakpoint(SLIDE_VIEWPORT_BREAKPOINTS);
  const orientation = useOrientation();
  const isCompactLandscape = useCompactLandscape();
  return useMemo(
    () => ({ breakpoint, orientation, isCompactLandscape }),
    [breakpoint, orientation, isCompactLandscape],
  );
};

export interface CanonicalMediaMatches {
  /** Live verdict for an art-direction media string. Canonical strings come
   * from the shared store (reactive); unknown strings fall back to a direct
   * `matchMedia` read — correct at call time, flagged by Diagnostics. */
  matches: (media: string) => boolean;
  /** Changes exactly when any canonical verdict changes — the ONE dependency
   * consumers watch to re-run asset choice (warm) or mask a swap (veil). */
  signature: string;
}

export const useCanonicalMediaMatches = (): CanonicalMediaMatches => {
  const verdicts = SLIDE_CANONICAL_SOURCE_MEDIA.map((media) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- static canonical list (module constant)
    useMediaQuery(media),
  );
  const signature = verdicts.map((v) => (v ? "1" : "0")).join("");
  return useMemo(() => {
    const map = new Map<string, boolean>(
      SLIDE_CANONICAL_SOURCE_MEDIA.map((media, i) => [media, verdicts[i]!]),
    );
    return {
      signature,
      matches: (media: string) => {
        const known = map.get(media);
        if (known !== undefined) return known;
        return typeof window !== "undefined"
          ? window.matchMedia(media).matches
          : false;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verdicts are fully encoded in signature
  }, [signature]);
};
