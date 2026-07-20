/**
 * The USER-ENVIRONMENT FACADE — one hook (`useUserEnvironment`) composing the
 * standalone signal hooks in `../library` into a single memoised object,
 * read once at an application boundary and injected into environment-aware
 * components (the carousel's `userEnvironment` prop). Facade-folder =
 * hook-name (the collection's rule for facade packages).
 */
export { useUserEnvironment } from "./useUserEnvironment";
export type { UserEnvironment } from "./useUserEnvironment";
