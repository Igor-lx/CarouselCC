# Gesture model

## The shared engine

The pointer-swipe primitive is a generic engine (`shared/engines/gesture`, its
own README carries the standalone contract): `usePointerSwipe` — touch-only
horizontal swipe with EMA-smoothed velocity, progressive distance resistance, an
intent threshold, quick-flick detection, capture/cooldown. It hands back one
spreadable `hostProps` bundle (ref + listeners + required styles), so the host
element is correct by construction; the carousel's `viewportRef` is filled via
the engine's optional `hostRef` forwarding. It is not carousel-specific — the
carousel overrides every tuning field with `CAROUSEL_SWIPE_CONFIG`.

Flick recognition judges the **whole** gesture, not its last segment: a
weighted-average velocity memory (grace + half-life) survives a finger settling
before lift-off, so a fast sweep that ends in a brief stick still rides as a
flick.

## Slot-normalized tuning

The engine thinks in absolute px of its host; the user's eye thinks in **slots**
("how far did content move relative to one slide"). A host-relative threshold
drifts with `visibleSlidesNr` — a fixed px is a larger fraction of a slide the
fewer are visible — so the tuning is slot-normalized before it reaches the engine.

[`gesture/slotAdaptiveSwipe.ts`](../../gesture/slotAdaptiveSwipe.ts)
(`resolveSlotAdaptiveSwipeConfig`, pure, unit-tested) translates content
semantics into engine units against the MEASURED slot (`useMeasuredSlotSize`):

- commit distance = `clamp(slot × commit.slotShare, commit.minPx, commit.maxPx)`,
  delivered via the engine's `minSwipeDistance` with `swipeThresholdRatio: 0` —
  the engine's own host-relative path is retired for the carousel. The base
  `CAROUSEL_SWIPE_CONFIG` is the engine config MINUS those two computed fields
  PLUS the `commit` group ([`config/gesture.ts`](../../config/gesture.ts)), so a
  resolver-owned field cannot be mis-set by hand.
- rubber curvature is rescaled by `SWIPE_REFERENCE_SLOT_PX / slot` (same relative
  stiffness at the same relative pull on any slot);
- flick qualification (`quickFlickVelocity`, `quickFlickMinOffset`) is rescaled
  by `slot / SWIPE_REFERENCE_SLOT_PX`.

`SWIPE_REFERENCE_SLOT_PX` is not a knob but a **calibration record** — the slot
width the rubber numbers were hand-tuned at — and lives next to the computation
it anchors. The engine stays untouched; slot semantics stay carousel-owned.
Diagnostics audit the constants and their relations (clamp ordering; the share at
the reference slot must land inside the clamps — see [diagnostics.md](./diagnostics.md)).

## The adapter

[`gesture/useCarouselGesture.ts`](../../gesture/useCarouselGesture.ts) is the
carousel-specific adapter:

1. **Press / intent.** Records the visually sampled origin and slot size. The
   drag-origin PAGE is the geometric nearest page when idle, but the interrupted
   ride's pending target when the grab lands mid-flight (else an early repeat
   swipe would round back to the ride's start page). It takes the track
   **synchronously** — `cancelTrackMotion(origin)` tears down any compositor
   animation and pins the track at the live origin — and publishes the origin via
   `applyTrackPosition`. The `START_DRAG` dispatch itself is **deferred** to its
   own task (the follow stream needs no React; the dragging render otherwise
   blocks frame presentation at the very start of a fast swipe). Order is still
   guaranteed: every dependent dispatch site flushes the pending `START_DRAG`
   first, so the reducer always sees START before END.
2. **Move.** Translates `uiOffset` into a virtual-index delta via the recorded
   slot size and writes it through `applyTrackPosition`. No React state per move.
3. **Release.** Computes the target via `resolveDragRelease`
   ([`domain/dragRelease.ts`](../../domain/dragRelease.ts)) and dispatches
   `END_DRAG` with the resolved target, both release velocities and `releasedAt`.

## Directionless release: hold vs scroll

A directionless END of an owned in-flight grab is ambiguous, and the adapter
splits it two ways:

- **A deliberate hold** (a lift, or the long-press context menu opening) settles
  onto the PRESSED slide — the one the eye and the menu are looking at. The
  `contextmenu` event fires on the host right as the menu opens, before the
  pointer is cancelled, so a per-gesture flag records it.
- **A page scroll that crossed the strip** (the engine saw vertical intent, or
  the browser stole the pointer with no menu open) is a false-positive catch, so
  the adapter RESUMES the interrupted ride to its own destination instead of
  re-routing it onto the pressed page.

The pressed page is found once, at press: press-X → slot lane under the finger →
its page (one rect read). Unmeasurable falls back to the anchor — the interrupted
ride's destination.

## Coasted launch (the commit gap)

A click retarget is carried through the commit by the previous WAAPI animation,
but a release has nothing painting — and nothing CAN paint through the gap (the
commit task owns the main thread; a per-frame RAF bridge was measured on device
and its ticks queue behind the very task they were meant to mask). So the gap is
closed **spatially, not temporally**: `END_DRAG` records `releasedAt`
(`motionNow()` at dispatch), and at takeover the runner extrapolates the launch
position over the measured gap at the release's visual velocity
(`resolveCoastedLaunchPosition`, pure, [`gesture/coast.ts`](../../gesture/coast.ts))
— one catch-up step at the eye's own speed instead of a freeze-and-restart from
the stale release point. It clamps AT the ride target (never overshoots),
launches from the release point on snap-backs and calm releases, and bounds the
interval by `GESTURE_COAST_MAX_MS` so a stalled commit cannot teleport the deck.

## The two release velocities

Stored on the snapshot, read by `useMotionRunner` when it builds the release
segment (the continuity launch, matching native scroll physics):

- **`uiReleaseVelocity`** — the visual speed the eye saw at lift-off — is the
  segment's START speed.
- **`pointerReleaseVelocity`** — the flick-memory intent, boosted — is the CRUISE
  target the profile accelerates to over
  `CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare`.

Content never jumps above its visible speed; a fast lift-off makes start ≈ cruise
and the ramp collapses. A **duration floor** (`minRideDurationMs`) keeps a
vigorous flick on a narrow slot from collapsing to a teleport: the intent speed
is re-solved down to the floor, but a launch speed that alone beats the floor is
never slowed (continuity wins).

## Disable and recovery

The whole surface is gated by `enabled: layout.canSlide && isSwipeOn` on the
primitive: when either is `false`, `usePointerSwipe` returns empty listeners and
host styles, so the viewport carries no pointer handlers at all. The two disable
paths part on recovery: a `canSlide` collapse is healed by the reducer's layout
reconciliation, but an `isSwipeOn` flip changes no layout — so the adapter itself
ends a drag orphaned by it, dispatching the same passive-snap `END_DRAG` (live
position, zero velocity) a motionless release would have produced, then clearing
its origin refs.
