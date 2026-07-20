/**
 * The USER-ENVIRONMENT FACADE — one hook (`useUserEnvironment`) that returns
 * a single memoised object of the environment signals, read once at an
 * application boundary and injected into environment-aware components (the
 * carousel's `userEnvironment` prop).
 *
 * SELF-SUFFICIENT BY DUPLICATION (the collection's facade rule, same as
 * kinetic): `internal/` carries its OWN COPIES of the signal hooks
 * (useIsReducedMotion / useIsTouchDevice / useDataSaver, plus the
 * useMediaQuery store reduced-motion rides) — this folder imports ONLY React
 * and itself and can be copied out whole. The copies may drift from the
 * originals in `../library` — by design. `tests/portability.test.ts`
 * enforces the no-escape guard.
 */
export { useUserEnvironment } from "./useUserEnvironment";
export type { UserEnvironment } from "./useUserEnvironment";
