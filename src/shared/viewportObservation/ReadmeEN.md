# `viewportObservation` — observe live viewport state

Hooks that OBSERVE the viewport at runtime through DOM/activity observers —
NOT CSS media queries (those live in `../clientState/media`).

| Hook | Returns | What |
| --- | --- | --- |
| `useViewportVisibility({ elementRef, threshold? })` | `boolean` | Is the element within the viewport AND the tab active (IntersectionObserver + document visibility). |
| `useViewportBusy({ enabled, quietDelayMs })` | getter | Is the viewport visually unsettled by interaction (finger down, scroll/fling, browser-chrome settle). Deliberately NON-reactive — a poll-time getter, never state. |

**On the local `useIsomorphicLayoutEffect`.** The folder ships its own copy so
it can be lifted out standalone, but in a project that already provides the
helper it must import THAT one (this repo does). `tests/singleSource.test.ts`
enforces it; the local copy stays dormant.
