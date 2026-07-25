# State machine

A reducer-backed state machine in [`state/`](../../state). The reducer is
**pure**: layout, config and instant-mode flow in as a `context` envelope on
every dispatch ([`state/useCarouselState.ts`](../../state/useCarouselState.ts)),
never captured from closure.

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

## Reconciliation

`CarouselLayout` is derived from props that can change without any command
firing. The reconcile rule (`reconcileStateToLayout`) runs at two boundaries —
render projection and the top of every command — so a layout change collapses
cleanly to an instant snap and no stale state/layout pair ever reaches a
consumer. This is the component's load-bearing state invariant; the full
rationale and its idempotency contract are in
[ADR-001](../adr/0001-layout-reconciliation.md).
