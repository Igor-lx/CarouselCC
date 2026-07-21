/**
 * The USER-ENVIRONMENT FACADE — one hook (`useUserEnvironment`) returning a
 * single memoised object of the environment signals, read once at an
 * application boundary and injected into environment-aware components (the
 * carousel's `userEnvironment` prop).
 *
 * LIFTABLE ON ITS OWN: `internal/` carries its OWN COPIES of the signal
 * hooks (useIsReducedMotion / useIsTouchDevice / useDataSaver), so copying
 * this folder leaves nothing behind. The ONE shared piece is the store the
 * reduced-motion query rides — `../../shared/useMediaQuery` — which must
 * stay single in a project. Take that file along.
 */
export { useUserEnvironment } from "./useUserEnvironment";
export type { UserEnvironment } from "./useUserEnvironment";
