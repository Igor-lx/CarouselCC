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
 * non-React consumers (the viewport facade, diagnostics, tests) share the
 * exact resolution semantics of the hook. */
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
