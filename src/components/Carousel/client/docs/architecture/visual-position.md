# Visual position

The single source of truth for "where is the track right now". It wraps exactly
one motion controller (from the shared motion engine) and exposes a small
subscribe/sample surface. Every per-frame consumer — the track transform writer,
the pagination widget — reads from here and nowhere else, so there is one
authoritative timeline and nothing to keep in sync.

The logical state machine never reads this position; the motion runner is the
only bridge between the two (see [overview](./overview.md)). This layer is purely
the sampled visible position, in virtual-index units, plus a page-offset
convenience derived from `visibleSlidesCount`.

## The frame

Each emit is a `VisualPositionFrame`: position and velocity, the current target,
the motion strategy and phase, progress, a timestamp, and `runningFrameIndex`.

`runningFrameIndex` is a streak counter, and it is the reason the layer stamps
it centrally. Running emits are numbered 0, 1, 2, …; any resting emit resets the
streak to 0. Because it is stamped once, at the single source, every subscriber
sees identical numbering — which is what lets the shared fallback frame-skip be a
pure function of the frame (below).

## The source API

- **`getSnapshot()`** — the last EMITTED frame. It can lag a live segment by up
  to one RAF, so it is the right answer for "what was last painted" but not for
  "where exactly is the curve now".
- **`sampleNow()`** — the exact current position from the controller's curve at
  `now()`, reflow-free, and during a live segment ahead of `getSnapshot()` by the
  sub-frame elapsed since the last emit. It is backed by the controller's
  `captureHandoff` — its coherent continuation point — which is exactly what a
  cold read that STARTS a new segment (a gesture press, a navigation click) wants,
  so the new motion begins from where the deck visually is without reading the
  DOM.
- **`wake()`** — takes paint back onto the JS frame loop when the external paint
  owner of a passive segment disappears mid-flight (the track's compositor
  animation was cancelled by a geometry re-base or a rotation). Without it the
  strip would freeze where the animation died and teleport at the settle. A no-op
  when idle or already ticking.
- **`subscribe(listener, { emitCurrent })`** — the per-frame subscription.

## Fallback pacing

`isDroppedFallbackFrame` is the ONE frame-skip rule shared by every per-frame
paint consumer when running without WAAPI. It is a pure function of the frame:
since the source stamps `runningFrameIndex`, every subscriber evaluating the
predicate on the same frame reaches the same verdict, so the track and the widget
drop exactly the same frames and stay visually locked regardless of when each
subscribed.

Only `"running"` frames are ever dropped. Resting frames (settle, idle) and
finger-drag frames (published with a non-running phase) always paint. The first
frame of a streak always paints; every Nth one after it is dropped.

## Immediate position writes

`applyImmediatePosition` sets the controller directly to a position with zero
velocity — the path a finger drag uses to place the track exactly under the
pointer, bypassing any profile. This is how the gesture layer writes per-move
positions without going through a motion segment.
