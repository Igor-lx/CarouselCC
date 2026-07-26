# Host status reporting

The one place the carousel talks *back* to its host: the optional
`onCarouselStatusChange` callback. It emits a small, read-only snapshot —
`isIdle`, `currentPageIndex`, `pageCount`, `isAtStart`, `isAtEnd` — so the host
can mirror carousel state into its own UI (a counter, external prev/next
buttons, analytics) without reaching inside.

## What is reported, and when

- **Low frequency only.** The snapshot is derived from logical state, never from
  a per-frame motion sample. It fires on mount and then only when one of the
  five reported fields changes — a moving track that does not cross a page
  boundary emits nothing.
- **Deduplicated.** `useCarouselStatusReporter` keeps the last emitted snapshot
  and compares shallowly (`areStatusSnapshotsEqual`); an identical consecutive
  snapshot is dropped. So an idle re-render, or a state change in a field the
  host does not observe, never re-fires the callback.
- **Target, not settled.** `currentPageIndex` is the TARGET page, not the page
  the track has physically reached. The host learns the user's intent the moment
  a click or gesture commits, not a ride later — so external UI tracks the
  destination in lockstep with the deck's own controls.

## Decisions

- **Emit is a side effect, gated on the callback's presence.** With no
  `onCarouselStatusChange` prop the effect does nothing at all — no snapshot is
  even built.
- **Pure comparator, isolated.** `areStatusSnapshotsEqual` is a pure function in
  its own file so the dedup rule is unit-testable and cannot drift from the
  snapshot shape.
