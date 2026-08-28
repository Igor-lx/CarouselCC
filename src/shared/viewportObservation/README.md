# viewportObservation

Hooks that OBSERVE live viewport state at runtime through DOM / activity
observers — NOT CSS media queries (those live in `../clientState/media`).

## API

| Hook | Returns | What |
| --- | --- | --- |
| `useViewportVisibility({ elementRef, threshold? })` | `boolean` | Whether the element is within the viewport AND the tab is active (IntersectionObserver + document visibility). `threshold` defaults to `0.2`. |
| `useViewportBusy({ enabled, quietDelayMs })` | `() => boolean` | Whether the viewport is visually unsettled by interaction (a finger down, an ongoing scroll / fling, a browser-chrome settle). A **getter**, not state. |

## `useViewportBusy` — why and how

**Why it exists.** When the mobile browser toolbar settles after a scroll, the
system compositor has to aggregate two live surfaces (the page + the animating
browser UI). On weak GPUs the page's frames then miss the presentation latch for
a few vsyncs — anything MOVING on the page visibly bounces, even though the
frames are produced on time. That stall is below the web platform; a page gets no
feedback and no lever over the compositor. The one thing it CAN do is not START
avoidable motion while the viewport is unsettled — this hook is that signal (a
scheduler gate for autoplay checks it before firing a tick).

**Non-reactive by design.** The result is a stable getter, never React state.

CONSTRAINT — nothing about a touch may re-render the consumer. Flipping state
inside the `touchstart` handler re-renders at the exact moment a finger lands,
which hitches an in-flight ride: the artifact this hook exists to avoid.
Internals are refs + timestamps only.

**Self-extending quiet window.** `quietDelayMs` is measured from the LAST
activity signal, and every signal refreshes it — so the window always covers the
full tail of whatever is happening (a fling of any length, a chrome settle of any
duration) without being tuned to either. While at least one finger is down it is
busy regardless.

## The local `useIsomorphicLayoutEffect` (dormant)

The folder ships its own copy of the helper so it can be lifted into an empty
project standalone. In a repo that already provides the helper it must import
THAT one instead (this repo does — `useViewportVisibility` imports
`../hooks/useIsomorphicLayoutEffect`), so the local copy stays dormant.
When lifting the folder out, point the import back at the local file.
