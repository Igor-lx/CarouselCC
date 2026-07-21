/**
 * The MEDIA FACADE — one hook (`useMedia`) that resolves a whole set of
 * media axes at once (width tiers + orientation + arbitrary flag
 * conditions). Returns the active breakpoint name, orientation, per-flag
 * booleans, an ad-hoc `matches`, and a `signature` that changes iff any
 * tracked verdict does.
 *
 * LIFTABLE ON ITS OWN: `internal/` carries its OWN COPIES of the hooks it
 * uses (the breakpoint resolver, the orientation queries) plus its
 * facade-only glue, so copying this folder leaves nothing behind. The ONE
 * thing it does NOT copy is the STORE: it imports
 * `../../shared/useMediaQuery`, which must stay single in a project — a
 * second store would mean a second set of browser listeners. Take that file
 * along. `index.ts` is the one public surface; `useMedia` is the one facade
 * hook at the root.
 */
export { useMedia } from "./useMedia";
export type { MediaState } from "./useMedia";
export { canonicalMediaQueries } from "./internal/canonicalMedia";
export type { MediaAxes } from "./internal/canonicalMedia";
