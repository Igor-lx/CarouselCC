# Autoplay

Advances the deck on a timer while the user is idle, and gets out of the way
the instant they are not. It is two halves in one folder:

- **`useAutoplay`** — a generic interval loop with no carousel knowledge. It
  arms a `setTimeout`, fires a callback, re-arms, and manages its own hover
  pause. It could drive any timed stepper.
- **`useCarouselAutoplay`** — the carousel adapter. It resolves *when* the loop
  is allowed to run (visibility, motion state, viewport quiet) and *what* a tick
  does (step forward, or loop back to the start at the end), then hands those to
  `useAutoplay`.

Both halves live inside the component on purpose: nothing outside the carousel
needs an autoplay loop, so unlike the pointer-swipe primitive there is no shared
engine to extract. The split is for clarity, not reuse.

## The pause model

The loop is suppressed by three independent gates; any one stops it:

1. **`enabled`** — the master switch. Wired from the public `isAutoplayOn` prop
   AND `layout.canSlide` (a deck that cannot slide never autoplays).
2. **`isPaused`** — the adapter's live "not now" signal: the viewport is
   off-screen, a drag is in progress, or a ride is already moving.
3. **internal hover-pause** — owned entirely by `useAutoplay`, driven through
   `handleHoverChange`. Debounced so cursor jitter across the edge does not
   toggle the timer; touch environments opt out via `ignoreHover`.

When `enabled` goes false or hover is ignored, any pending hover-pause timer is
cleared and the internal pause resets, so the loop cannot come back stuck.

## The tick gate

`shouldDeferTick` is a distinct, finer-grained gate from `isPaused`, and the
distinction matters. It is checked **when the timer fires**, not before it is
armed, and it is a **getter, not a reactive flag**. Its sources — a finger
anywhere on the glass, an ongoing scroll or fling, the browser chrome settling —
change at input frequency. Flipping React state on a `touchstart` would
re-render the whole deck at the exact moment a finger lands, hitching an
in-flight ride. So the adapter exposes it as a poll (`useViewportBusy`), and a
deferred tick simply re-arms a full interval — the same resume feel as any other
pause, no missed-then-caught-up lurch.

Why gate ticks on viewport quiet at all: a tick fired into the browser-chrome
settle window lands on a compositor busy aggregating two live surfaces, and on
weak GPUs the ride's first frames miss the presentation latch and visibly
bounce. Waiting for quiet costs nothing the user perceives and removes the
bounce.

## Finite-mode loop-back

In finite mode the deck has a real last page. When a tick would fire on the end
boundary (`isAtEnd`), the adapter calls `goTo(0)` instead of `move(1)`, so the
loop reads as visually continuous rather than dead-ending. In cyclic mode this
never triggers — `move(1)` wraps on its own.

## Referential stability

The step handlers (`onStep`, `onGoToStart`) sit in the dependency array of the
interval effect. A fresh identity per render would tear down and re-arm the
timer, measuring the next interval from the render instead of from the last
tick — so the adapter memoises them against `navigation` alone. This is the one
non-obvious wiring constraint in the layer.

## Viewport visibility

The adapter owns the viewport-visibility subscription
(`useViewportVisibility` — IntersectionObserver plus tab visibility) because
autoplay is its only consumer; there is no reason to lift it to the root. It
feeds the `isPaused` gate directly.
