import { useMemo } from "react";

import { useMediaQuery } from "./useMediaQuery";
import {
  breakpointMinWidthQuery,
  resolveActiveBreakpoint,
  sortedBreakpointEntries,
  type BreakpointTable,
} from "./resolveActiveBreakpoint";

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
  // A verdict-map built from the live subscriptions, so `resolveActiveBreakpoint`
  // reuses the exact numeric resolution instead of re-deriving it.
  const signature = matched.map((m) => (m ? "1" : "0")).join("");
  return useMemo(() => {
    const verdict = new Map(
      entries.map(([, px], i) => [breakpointMinWidthQuery(px), matched[i]!]),
    );
    const name = resolveActiveBreakpoint(table, (q) => verdict.get(q) ?? false);
    return {
      name,
      pick: (values) => values[name] ?? values.DEFAULT,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verdicts encoded in signature; table is a static constant
  }, [signature]);
}
