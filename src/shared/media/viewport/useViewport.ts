import { useMemo } from "react";

import { useMediaQuery } from "../library/useMediaQuery";
import { resolveActiveBreakpoint } from "../library/resolveActiveBreakpoint";
import {
  PORTRAIT_ORIENTATION_QUERY,
  type ViewportOrientation,
} from "../library/useOrientation";
import {
  viewportCanonicalMedia,
  type ViewportAxes,
} from "./internal/canonicalMedia";

export interface Viewport {
  /** Active width-tier NAME (from the axes' breakpoint table). */
  breakpoint: string;
  orientation: ViewportOrientation;
  /** Each declared flag NAME -> whether its condition currently matches. */
  flags: Readonly<Record<string, boolean>>;
  /** Live verdict for any media string. Canonical strings (the tiers,
   * orientations and flags of these axes) are reactive; anything else falls
   * back to a direct read — correct at call time. */
  matches: (media: string) => boolean;
  /** Changes exactly when any tracked verdict changes — the ONE value a
   * consumer watches to re-run work (asset choice, a reorientation mask). */
  signature: string;
}

/**
 * THE viewport facade — one call answers "what viewport state are we in" for
 * a caller-supplied set of axes (width tiers + orientation + arbitrary flag
 * conditions). Combines the single-axis primitives over the ONE shared
 * `useMediaQuery` store (a single browser listener per distinct condition,
 * no matter how many consumers or how many times this is called).
 *
 * `axes` MUST be a static module constant: one hook is subscribed per
 * tracked condition, so the set's size and order may not change between
 * renders.
 */
export function useViewport(axes: ViewportAxes): Viewport {
  const queries = viewportCanonicalMedia(axes);
  const bits = queries.map((query) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- static axes contract (documented above)
    useMediaQuery(query),
  );
  const signature = bits.map((bit) => (bit ? "1" : "0")).join("");

  return useMemo(() => {
    const map = new Map(queries.map((query, i) => [query, bits[i]!]));
    const matches = (media: string): boolean =>
      map.has(media)
        ? map.get(media)!
        : typeof window !== "undefined"
          ? window.matchMedia(media).matches
          : false;
    const breakpoint = resolveActiveBreakpoint(axes.breakpoints, matches);
    const orientation: ViewportOrientation = matches(PORTRAIT_ORIENTATION_QUERY)
      ? "portrait"
      : "landscape";
    const flags = Object.fromEntries(
      Object.entries(axes.flags ?? {}).map(([name, query]) => [
        name,
        matches(query),
      ]),
    );
    return { breakpoint, orientation, flags, matches, signature };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verdicts fully encoded in signature; axes is a static constant
  }, [signature]);
}
