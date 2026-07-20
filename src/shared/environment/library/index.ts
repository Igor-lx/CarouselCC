/**
 * The ENVIRONMENT LIBRARY — individual, standalone user-environment signal
 * hooks. Each is usable on its own. Grouped by MEANING, not mechanism:
 * `useIsReducedMotion` is a pure media query (rides the shared `useMediaQuery`
 * store), while `useIsTouchDevice` (pointerdown detection) and `useDataSaver`
 * (Network Information API) mix in non-media sources and keep custom stores.
 * The `../useUserEnvironment` facade mirrors them (by duplication).
 */
export { useIsReducedMotion } from "./useIsReducedMotion";
export { useIsTouchDevice } from "./useIsTouchDevice";
export { useDataSaver } from "./useDataSaver";
