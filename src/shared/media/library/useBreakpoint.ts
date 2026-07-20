import { useMemo } from "react";

import { useMediaQuery } from "./useMediaQuery";

/**
 * A width-tier table: tier names mapped to their `min-width` thresholds in
 * px. Names carry no meaning to the resolver — resolution is purely numeric
 * ("the largest threshold the viewport currently clears wins"), so
 * declaration order and naming can never shadow a wider tier with a narrower
 * one. A `0` entry is the natural fallback (matches everything).
 */
export type BreakpointTable = Readonly<Record<string, number>>;

/** A sensible default tier set for the common case; callers with their own
 * thresholds pass their own table instead. */
export const STANDARD_BREAKPOINTS: BreakpointTable = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
};

/** The canonical CSS form of one tier threshold — the SAME string data
 * (`<source media>`) and diagnostics must use, so every leg of a breakpoint
 * contract derives from the one number in the table. */
export const breakpointMinWidthQuery = (px: number): string =>
  `(min-width: ${px}px)`;

/** Tiers in resolution order (largest threshold first). Pure and exported so
 * non-React consumers (a facade, diagnostics, tests) share the exact
 * resolution semantics of the hook. */
export const sortedBreakpointEntries = (
  table: BreakpointTable,
): Array<[string, number]> =>
  Object.entries(table).sort((a, b) => b[1] - a[1]);

/**
 * Pure resolution core: the first tier (in descending-threshold order) whose
 * query matches; if none does, the narrowest tier is the fallback. `matches`
 * abstracts the media evaluation so the hook and non-React consumers share
 * one implementation. Lives WITH the hook — it is the hook's own kernel, not
 * a second "breakpoint" module.
 */
export const resolveActiveBreakpoint = (
  table: BreakpointTable,
  matches: (query: string) => boolean,
): string => {
  const entries = sortedBreakpointEntries(table);
  const hit = entries.find(([, px]) => matches(breakpointMinWidthQuery(px)));
  return (hit ?? entries[entries.length - 1])?.[0] ?? "";
};

export interface BreakpointState {
  /** The active tier NAME of the table. */
  name: string;
  /**
   * Pick a value for the active tier: `pick({ desktop: 2, mobile: 1 })`.
   * Falls back to a `DEFAULT` entry when the active tier has no value.
   */
  pick: <T>(values: Partial<Record<string, T>> & { DEFAULT?: T }) => T | undefined;
}

/**
 * THE breakpoint hook — one call gives both the active tier NAME and a
 * value-`pick`er over it, so it serves both "which tier am I in" and the
 * classic "a value per tier" (visible count, columns, …). Pass ANY table
 * (custom names/thresholds) or the exported `STANDARD_BREAKPOINTS`. One
 * shared-store `min-width` listener per tier, shared across every consumer
 * of the same table.
 *
 * The table MUST be a static module constant: one hook is subscribed per
 * tier, so its size and order may not change between renders.
 */
export function useBreakpoint(table: BreakpointTable): BreakpointState {
  const entries = sortedBreakpointEntries(table);
  const matched = entries.map(([, px]) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- static table contract (documented above)
    useMediaQuery(breakpointMinWidthQuery(px)),
  );
  // The active tier NAME — the single primitive the result depends on. Cheap
  // to derive every render; the shared `resolveActiveBreakpoint` keeps the
  // "largest matching threshold wins" rule in one place.
  const verdict = new Map(
    entries.map(([, px], i) => [breakpointMinWidthQuery(px), matched[i]!]),
  );
  const name = resolveActiveBreakpoint(table, (q) => verdict.get(q) ?? false);
  // Memoised on that name alone, so the object identity is stable while the
  // tier is unchanged — no exhaustive-deps override needed.
  return useMemo<BreakpointState>(
    () => ({ name, pick: (values) => values[name] ?? values.DEFAULT }),
    [name],
  );
}
