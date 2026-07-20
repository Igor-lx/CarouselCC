/**
 * ENVIRONMENT — user-environment signals a UI may react to, in two tiers:
 *  - `library/` — individual standalone signal hooks (useIsReducedMotion,
 *    useIsTouchDevice, useDataSaver). Grab one.
 *  - `useUserEnvironment/` — the FACADE: one memoised object composed from
 *    the library, for a host to read once and inject.
 * A general toolkit for arbitrary consumers.
 */
export * from "./library";
export * from "./useUserEnvironment";
