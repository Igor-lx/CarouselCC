/**
 * The MEDIA FACADE — one hook (`useMedia`) that resolves a whole set of
 * media axes at once (width tiers + orientation + arbitrary flag
 * conditions). Returns the active breakpoint name, orientation, per-flag
 * booleans, an ad-hoc `matches`, and a `signature` that changes iff any
 * tracked verdict does.
 *
 * SELF-SUFFICIENT BY DUPLICATION (the collection's facade rule, same as
 * kinetic): `internal/` carries its OWN COPIES of the primitives it uses
 * (useMediaQuery, the breakpoint resolver, the orientation queries) plus its
 * facade-only glue — this folder imports ONLY React and itself, so it can be
 * copied out whole to any project. The copies may drift from the originals
 * in `../library` — by design. `tests/portability.test.ts` enforces the
 * no-escape guard; `index.ts` is the one public surface; `useMedia` is the
 * one facade hook at the root. The standalone primitives are their own
 * library (`../library`) — take them from there when you need just one.
 */
export { useMedia } from "./useMedia";
export type { MediaState } from "./useMedia";
export { canonicalMediaQueries } from "./internal/canonicalMedia";
export type { MediaAxes } from "./internal/canonicalMedia";
