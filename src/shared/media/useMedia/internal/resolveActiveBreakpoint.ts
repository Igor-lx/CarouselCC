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
 * non-React consumers (the viewport facade, diagnostics, tests) share the
 * exact resolution semantics of the hook. */
export const sortedBreakpointEntries = (
  table: BreakpointTable,
): Array<[string, number]> =>
  Object.entries(table).sort((a, b) => b[1] - a[1]);

/**
 * Pure resolution core: the first tier (in descending-threshold order) whose
 * query matches; if none does, the narrowest tier is the fallback. `matches`
 * abstracts the media evaluation so the `useBreakpoint` hook, the viewport
 * facade and non-React consumers all share one implementation.
 */
export const resolveActiveBreakpoint = (
  table: BreakpointTable,
  matches: (query: string) => boolean,
): string => {
  const entries = sortedBreakpointEntries(table);
  const hit = entries.find(([, px]) => matches(breakpointMinWidthQuery(px)));
  return (hit ?? entries[entries.length - 1])?.[0] ?? "";
};
