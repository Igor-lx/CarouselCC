/**
 * VIEWPORT OBSERVATION — standalone hooks that OBSERVE live viewport state
 * at runtime, via DOM/activity observers (NOT CSS media queries — those live
 * in `../media`). Each is usable on its own:
 *  - `useViewportVisibility` — is an element within the viewport and the tab
 *    active (IntersectionObserver + document visibility);
 *  - `useViewportBusy` — is the viewport visually unsettled by interaction
 *    (a finger down, an ongoing scroll/fling, browser-chrome settle).
 */
export { useViewportVisibility } from "./useViewportVisibility";
export { useViewportBusy } from "./useViewportBusy";
