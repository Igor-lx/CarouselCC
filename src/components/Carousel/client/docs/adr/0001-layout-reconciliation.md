# ADR-001 — One pure reconcile rule, two boundaries

**Status:** Accepted

## Context

`CarouselLayout` is derived from props that can change without a reducer
command ever firing — a viewport resize, a `slidesData` replacement, an
`isFinite` (finite/cyclic) toggle. The physical reducer state (current page,
virtual index, motion phase) can therefore fall out of step with the layout it
was computed against, and the stale pair must never reach a runtime consumer or
a layout effect, or the deck paints against a layout that no longer exists.

## Decision

Keep one **physical** `committedState` from `useReducer`, and project it
through a single pure function, `reconcileStateToLayout(committedState, layout)`
([`state/reconcile.ts`](../../state/reconcile.ts)), during render. The projected
**effective** state is what every runtime consumer reads
([`state/useCarouselState.ts`](../../state/useCarouselState.ts)).

The same pure reconciler runs at the top of every reducer command, so a
physical transition also starts from the live layout. The rule is applied at
exactly two boundaries — render projection and command entry — and nowhere
else.

## Consequences

- A resize, data replacement, or `isFinite` toggle is reconciled **immediately**,
  even when no user command fires.
- There is no layout-effect catch-up command and no transient render that
  exposes a new-layout / old-state pair to layout effects.
- The reconciler must be **idempotent**: reconciling an already-reconciled state
  against an equivalent layout returns the same reference. This is a hard
  contract, enforced by [`state/reconcile.test.ts`](../../state/reconcile.test.ts).
- See [`docs/architecture/state.md`](../architecture/state.md) for the state
  machine this rule sits inside.
