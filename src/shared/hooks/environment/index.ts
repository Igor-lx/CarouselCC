/**
 * User-environment signals — the family a host composes and injects into
 * environment-aware components (the carousel's `userEnvironment` prop):
 * reduced motion, touch-first input, reduced data. Grouped by MEANING, not
 * mechanism: `useIsReducedMotion` is a pure media query (rides the shared
 * `useMediaQuery` store), while `useIsTouchDevice` (pointerdown detection)
 * and `useDataSaver` (Network Information API) mix in non-media sources and
 * keep custom stores. `useUserEnvironment` is the one-object composition.
 */
export { useIsReducedMotion } from "./useIsReducedMotion";
export { useIsTouchDevice } from "./useIsTouchDevice";
export { useDataSaver } from "./useDataSaver";
export { useUserEnvironment } from "./useUserEnvironment";
export type { UserEnvironment } from "./useUserEnvironment";
