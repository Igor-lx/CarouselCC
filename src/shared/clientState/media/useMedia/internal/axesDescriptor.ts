// See ../README.md
import { canonicalMediaQueries, type MediaAxes } from "./canonicalMedia";
import {
  sortedBreakpointEntries,
  type BreakpointTable,
} from "./resolveActiveBreakpoint";

/**
 * Everything the facade derives its state from, resolved once per SHAPE of
 * axes and handed back as one stable object. Consumers then memo on it
 * directly, so a caller may rebuild its axes object every render — the
 * descriptor, and therefore the memo, stays put.
 */
export interface MediaAxesDescriptor {
  readonly key: string;
  /** Tracked conditions, in signature-bit order. */
  readonly queries: readonly string[];
  readonly breakpoints: BreakpointTable;
  /** Declared flag name -> its condition. */
  readonly flags: ReadonlyArray<readonly [string, string]>;
}

/**
 * A complete serialisation of the axes: two objects with this key resolve
 * identically, which is what makes it safe as both the cache key and the memo
 * dependency standing in for the axes themselves.
 */
export const mediaAxesKey = (axes: MediaAxes): string =>
  sortedBreakpointEntries(axes.breakpoints)
    .map(([name, px]) => `${name}:${px}`)
    .join(",") +
  "|" +
  Object.entries(axes.flags ?? {})
    .map(([name, query]) => `${name}:${query}`)
    .join(",");

// One small, immutable entry per DISTINCT shape. A caller inventing new
// conditions on every render would grow it; a caller merely rebuilding the
// same shape lands on the same entry.
const descriptors = new Map<string, MediaAxesDescriptor>();

export const resolveAxesDescriptor = (axes: MediaAxes): MediaAxesDescriptor => {
  const key = mediaAxesKey(axes);
  let descriptor = descriptors.get(key);
  if (!descriptor) {
    descriptor = {
      key,
      queries: canonicalMediaQueries(axes),
      breakpoints: axes.breakpoints,
      flags: Object.entries(axes.flags ?? {}),
    };
    descriptors.set(key, descriptor);
  }
  return descriptor;
};
