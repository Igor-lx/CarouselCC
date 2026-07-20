/**
 * MEDIA — reactive CSS-media-query capabilities, in two tiers:
 *  - `library/` — individual standalone hooks (useMediaQuery, useBreakpoint,
 *    useOrientation, useShortLandscape). Grab one.
 *  - `viewport/` — the FACADE (`useViewport`): one call resolving a whole
 *    set of axes at once, composed from the library.
 * A general toolkit for arbitrary consumers; nothing here is shaped by any
 * particular component.
 */
export * from "./library";
export * from "./viewport";
