/**
 * SHARED base of the clientState blanks — the ONE piece every folder here
 * depends on and the ONE piece that must NOT be duplicated when you copy a
 * blank out.
 *
 * `useMediaQuery` is a STORE: it keeps one `MediaQueryList` listener per
 * distinct query and hands the same live verdict to every consumer. Keep it
 * single. Pure logic (resolvers, query constants) is deliberately duplicated
 * across the blanks — duplicating a pure function costs nothing; duplicating
 * a store would split the listener registry into independent copies.
 *
 * COPYING OUT: take the blank folder(s) you need, then take THIS file too —
 * put it anywhere in your project and point the copied imports at it. One
 * copy, however many blanks you took.
 */
export { useMediaQuery } from "./useMediaQuery";
