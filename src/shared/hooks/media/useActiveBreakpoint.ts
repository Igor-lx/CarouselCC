import { useMediaQuery } from "./useMediaQuery";

/**
 * A caller-supplied width-tier table: CUSTOM tier names mapped to their
 * `min-width` thresholds in px. Names carry no meaning to the resolver —
 * resolution is purely numeric ("the largest threshold the viewport
 * currently clears wins"), so declaration order and naming can never shadow
 * a wider tier with a narrower one. A `0` entry is the natural fallback
 * (matches everything).
 */
export type BreakpointTable = Readonly<Record<string, number>>;

/** The canonical CSS form of one tier threshold — the SAME string consumers
 * (art-directed `<source media>`, diagnostics) must use, so every leg of a
 * breakpoint contract derives from the one number in the table. */
export const breakpointMinWidthQuery = (px: number): string =>
  `(min-width: ${px}px)`;

/** Tiers in resolution order (largest threshold first). Pure and exported so
 * non-React consumers (data validation, diagnostics, tests) share the exact
 * resolution semantics of the hook. */
export const sortedBreakpointEntries = (
  table: BreakpointTable,
): Array<[string, number]> =>
  Object.entries(table).sort((a, b) => b[1] - a[1]);

/**
 * Pure resolution core: the first tier (in descending-threshold order) whose
 * query matches; if none does, the narrowest tier is the fallback. `matches`
 * abstracts the media evaluation so tests and non-React consumers can reuse
 * the exact hook semantics.
 */
export const resolveActiveBreakpoint = (
  table: BreakpointTable,
  matches: (query: string) => boolean,
): string => {
  const entries = sortedBreakpointEntries(table);
  const hit = entries.find(([, px]) => matches(breakpointMinWidthQuery(px)));
  return (hit ?? entries[entries.length - 1])?.[0] ?? "";
};

/**
 * The active tier NAME for a caller-supplied table. One shared-store
 * `min-width` listener per tier, shared across every consumer of the same
 * table.
 *
 * The table MUST be a static module constant: hooks are subscribed per
 * entry, so its size and iteration order may not change between renders.
 */
export function useActiveBreakpoint(table: BreakpointTable): string {
  const entries = sortedBreakpointEntries(table);
  const matched = entries.map(([, px]) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- static table contract (documented above)
    useMediaQuery(breakpointMinWidthQuery(px)),
  );
  const index = matched.findIndex(Boolean);
  return (
    entries[index >= 0 ? index : entries.length - 1]?.[0] ?? ""
  );
}
