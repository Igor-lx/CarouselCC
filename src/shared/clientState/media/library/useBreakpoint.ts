import { useMemo } from "react";

import { useMediaQuerySet } from "../../sharedStore/useMediaQuerySet";

// See ../README.md
/** Tier names → `min-width` px; resolution is purely numeric (largest matching wins). */
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
): Array<[string, number]> => Object.entries(table).sort((a, b) => b[1] - a[1]);

/** First tier (descending) whose query matches, else the narrowest fallback. */
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
  pick: <T>(
    values: Partial<Record<string, T>> & { DEFAULT?: T },
  ) => T | undefined;
}

/**
 * Everything a table resolves to, worked out once per table SHAPE and handed
 * back as one stable object — so a caller may rebuild its table every render.
 */
interface TierPlan {
  readonly entries: ReadonlyArray<readonly [string, number]>;
  readonly queries: readonly string[];
}

const plans = new Map<string, TierPlan>();

const resolveTierPlan = (table: BreakpointTable): TierPlan => {
  const entries = sortedBreakpointEntries(table);
  const key = entries.map(([name, px]) => `${name}:${px}`).join(",");
  let plan = plans.get(key);
  if (!plan) {
    plan = {
      entries,
      queries: entries.map(([, px]) => breakpointMinWidthQuery(px)),
    };
    plans.set(key, plan);
  }
  return plan;
};

/**
 * The active tier of `table`, live.
 *
 * The table may be built however the caller likes: every tier is watched
 * through ONE subscription, so the number of tiers never reaches React's hook
 * counter (see `shared/useMediaQuerySet.ts`).
 */
export function useBreakpoint(table: BreakpointTable): BreakpointState {
  const plan = resolveTierPlan(table);
  const signature = useMediaQuerySet(plan.queries);

  return useMemo<BreakpointState>(() => {
    const hit = plan.entries.findIndex((_, i) => signature[i] === "1");
    const active =
      hit >= 0 ? plan.entries[hit] : plan.entries[plan.entries.length - 1];
    const name = active?.[0] ?? "";
    return { name, pick: (values) => values[name] ?? values.DEFAULT };
  }, [plan, signature]);
}
