import { useMemo } from "react";

import { useMediaQuerySet } from "../../sharedStore/useMediaQuerySet";
import {
  resolveAxesDescriptor,
  type MediaAxesDescriptor,
} from "./internal/axesDescriptor";
import { resolveActiveBreakpoint } from "./internal/resolveActiveBreakpoint";
import {
  PORTRAIT_ORIENTATION_QUERY,
  type ViewportOrientation,
} from "./internal/useOrientation";
import type { MediaAxes } from "./internal/canonicalMedia";

export interface MediaState {
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

/** Pure in its two arguments — which is why the memo below needs no exception:
 * the descriptor already stands for the axes, one object per shape. */
const buildMediaState = (
  axes: MediaAxesDescriptor,
  signature: string,
): MediaState => {
  const verdicts = new Map(
    axes.queries.map((query, i) => [query, signature[i] === "1"]),
  );
  const matches = (media: string): boolean =>
    verdicts.has(media)
      ? verdicts.get(media)!
      : typeof window !== "undefined"
        ? window.matchMedia(media).matches
        : false;
  return {
    breakpoint: resolveActiveBreakpoint(axes.breakpoints, matches),
    orientation: matches(PORTRAIT_ORIENTATION_QUERY) ? "portrait" : "landscape",
    flags: Object.fromEntries(
      axes.flags.map(([name, query]) => [name, matches(query)]),
    ),
    matches,
    signature,
  };
};

/**
 * Resolve a whole set of media axes in ONE subscription.
 *
 * `axes` may be built however the caller likes — inline, from state, from a
 * fetched config. The set is folded into a single external store, so the hook
 * count here is 1 no matter how many conditions the set holds (see
 * `shared/useMediaQuerySet.ts` for why that matters).
 */
export function useMedia(axes: MediaAxes): MediaState {
  const descriptor = resolveAxesDescriptor(axes);
  const signature = useMediaQuerySet(descriptor.queries);

  return useMemo(
    () => buildMediaState(descriptor, signature),
    [descriptor, signature],
  );
}
