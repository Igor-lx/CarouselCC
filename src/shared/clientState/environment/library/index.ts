/**
 * The ENVIRONMENT LIBRARY — individual, standalone user-environment signal
 * hooks. Each is usable on its own. Grouped by MEANING, not mechanism:
 * `useIsReducedMotion` is a pure media query and is the only one touching
 * the shared store (`../../shared/useMediaQuery` — copy that file along
 * with it), while `useIsTouchDevice` (pointerdown detection) and
 * `useDataSaver` (Network Information API) read non-media sources and keep
 * their own small stores.
 *
 * The `../useUserEnvironment` facade keeps its OWN copies of these hooks so
 * it can be lifted independently.
 */
export { useIsReducedMotion } from "./useIsReducedMotion";
export { useIsTouchDevice } from "./useIsTouchDevice";
export { useDataSaver } from "./useDataSaver";
