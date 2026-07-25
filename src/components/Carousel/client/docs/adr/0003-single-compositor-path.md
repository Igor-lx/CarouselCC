# ADR-003 — One compositor path for every planned motion

**Status:** Accepted

## Context

A fresh reader's first reaction is legitimate: *"it's a one-page step on a
button — `transition: transform` plus one `translateX(...)` write would do; why
the keyframe machinery?"* Every planned motion (click step, autoplay step,
snap-back, gesture release, repeated click, every GO_TO slice) instead runs as a
WAAPI keyframe animation built from the engine's motion plan. This ADR records
why the naive alternative was rejected.

## Decision

Transport every engine-planned motion through **one** compositor path: a
percent-progress keyframe animation generated from the shared motion plan, with
a JS controller sampling each segment as the visual-position source of truth.

The naive `transition: transform` version fails four separate ways, and each
failure is something this carousel visibly does:

1. **The curve.** A CSS transition eases by a `transition-timing-function`, and
   the engine's accel/cruise/decel profile (distance shares) is not expressible
   as one — no bezier holds a flat cruise between two ramps. The "simple" step
   would move on a second, approximated curve: two sources of truth for how one
   step feels, drifting apart with every tuning change, and a step that feels
   different from the autoplay step, the release glide, and the jump beside it.
2. **The retarget.** Click again mid-flight and a transition restarts toward the
   new value with the same easing from a standstill — a visible velocity kink,
   because a transition carries no notion of current speed. The engine rebuilds
   the segment from a `(position, velocity)` handoff and the compositor
   keyframes reproduce it, so a second click continues the motion instead of
   rebooting it. Repeated-click pickup is built on exactly this.
3. **The chorus.** The track is not the only thing moving: the pagination widget
   strip and the dot cross-fade run over the SAME curve and the SAME clock
   (`startedAt` pinning). A CSS transition has no shareable plan and no settable
   start time — the followers would have to guess at its phase. And
   `transitionend` as a settle signal is famously lossy (interrupted/canceled
   transitions never fire it), while the controller's settle is deterministic.
4. **The jank.** The original start-of-motion freeze was main-thread
   contention, and it hit the single click step hardest — a step begins exactly
   when the main thread is busiest (React commits the expanded render window,
   images decode). `transition` on `transform` is compositor-driven too, so this
   point alone would not reject it — but points 1–3 already have, and the
   pre-WAAPI per-frame JS writes it would replace are how the jank was born.

## Consequences

- One curve, continuous retargets, a synchronized chorus, and a deterministic
  settle — all from a single mechanism, not four special cases.
- The accepted cost: the JS controller still samples every segment as the
  visual-position source of truth while the compositor paints. See
  [`docs/architecture/motion.md`](../architecture/motion.md).
- Motion detail (segments, the handoff invariant, the far GO_TO teleport, stable
  slide lanes) lives in [`docs/architecture/motion.md`](../architecture/motion.md).
