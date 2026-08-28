# State machine

A reducer-backed state machine in [`state/`](../../state). The reducer is
**pure**, and it owns the context it decides with: layout, config and
instant-mode are fields of the state, not something handed in per command. The
host's values are committed by a single `SYNC_CONTEXT` command that
[`state/useCarouselState.ts`](../../state/useCarouselState.ts) issues during
render, before anything can dispatch — so nothing is captured from closure, and
whatever reads the state reads the same context the reducer used. See
[ADR-004](../adr/0004-reducer-owns-its-context.md).

## Commands

`CarouselCommand` is a discriminated union
([`state/types.ts`](../../state/types.ts)):

- **`START_DRAG { fromVirtualIndex, targetPageIndex? }`** — press-down on the
  non-interactive surface, or after horizontal intent on an interactive child.
- **`END_DRAG { targetPageIndex, targetVirtualIndex, isSnap, isInstant?,
  pointerReleaseVelocity, uiReleaseVelocity, launchVelocity, releasedAt }`** —
  gesture release. The velocity trio and `releasedAt` feed the continuity launch
  and the coast bridge (see [`gesture.md`](./gesture.md)).
- **`MOVE { step, moveReason, fromVirtualIndex, isInstant? }`** — click /
  controls / autoplay step.
- **`GO_TO { targetPageIndex, moveReason, fromVirtualIndex, isInstant? }`** —
  pagination click / autoplay loop-back / external jump.
- **`MOTION_SETTLED { settledPosition }`** — fired by the motion runner when the
  controller completes. Carries the position the controller actually settled at,
  so the reducer can tell "the current target finished" from "an older target
  finished while a newer one is already pending".

## Discriminants

- **`MotionPhase`** = `"idle" | "step-normal" | "step-jump" | "step-snap" |
  "step-instant" | "dragging"`.
- **`MoveReason`** = `"click" | "gesture" | "autoplay"`. The state field holds
  `MoveReason | null`, where `null` is the pre-action initial state — before the
  carousel has moved for any reason.

## Step resolution

`resolveStepTransition` turns a `MOVE` / `GO_TO` command into the next state
(`transitions.ts`). Its subtleties are the reason the reducer stays small:

- **The step origin.** `stepOrigin` picks the "from" page a step counts from.
  Normally the cursor is `state.targetPageIndex` — the pending destination while a
  ride is queued, the settled page while idle — and the caller's origin only
  supplies the lane reference for a fresh handoff. On a same-direction repeat
  click, the cursor is instead the LIVE visual page, so a rapid click resolves one
  page ahead of where the deck is NOW and never accumulates further ahead than the
  user can see.
- **Repeated clicks.** A `MOVE` click arriving while the deck already animates the
  same direction is a "same-direction repeat" (`isSameDirectionRepeat`). It does
  not change the destination model — it selects the fast motion profile — but its
  effective step lands `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES` ahead of the live
  visual page, so rapid clicks visibly extend the run instead of bunching up on
  the first segment.
- **Dot-scale direction.** A `GO_TO` uses the plain page difference, NOT the
  shortest cyclic path: a dot to the left always travels left, matching how the
  user moved on the pagination strip. A cyclic shortcut would sometimes ride
  against the strip and saves nothing, because a far span is already bounded by
  the teleport plan. Cyclic wrap stays the business of ±1 steps.
- **Teleport bounding.** A long `GO_TO` animates a bounded preflight, teleports
  the hidden middle, then animates a fixed approach (see [motion](./motion.md)
  for the profile). While a teleport is pending, `virtualIndex` deliberately stays
  at the preflight landing — the render window is built from it, so the far target
  must never leak into it — and `teleportVirtualIndex` carries the real
  destination until `MOTION_SETTLED` performs the cut.

## Reconciliation

`CarouselLayout` is derived from props that can change without any command
firing. The reconcile rule (`reconcileStateToLayout`) runs at two boundaries —
render projection and the top of every command — so a layout change collapses
cleanly to an instant snap and no stale state/layout pair ever reaches a
consumer. This is the component's load-bearing state invariant; the full
rationale and its idempotency contract are in
[ADR-001](../adr/0001-layout-reconciliation.md).
