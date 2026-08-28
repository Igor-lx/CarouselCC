# ADR-004 — The reducer owns the context it decides with

**Status:** Accepted

## Context

Three values decide almost every transition and none of them belonged to the
reducer: `layout` (page count, page size, finite or cyclic), `config` (the
resolved runtime numbers) and `isInstantMode` (reduced motion). They are host
inputs, so they arrived per command, in a `context` envelope built by
`dispatch`:

```ts
dispatchRaw({ ...command, context: { layout, config, isInstantMode } });
```

For `dispatch` to keep a stable identity — it is handed to gestures, autoplay,
pagination and navigation, and re-identifying it restarts their timers and
subscriptions — it had to be created once. A function created once sees the
values it closed over, so the fresh ones were kept in refs rewritten on every
render. That is what made the file the last holdout of the React Compiler rules:
a ref written during render, read by a callback that may run in the very same
commit.

It also left `layout` in two places. The state carried the layout it had been
reconciled against, and the envelope carried the live one, and every command
reconciled the two. `validateCarouselState` already stated the principle the
rest of the module did not follow: *"the state owns the layout it was reconciled
against, so a second `layout` param could not disagree with it."*

## Decision

Put the context in the state. `CarouselState` carries `layout`, `config` and
`isInstantMode`; `ReducerEnvelope` is gone; the reducer's input is a plain
command.

One command the carousel never issues itself, `SYNC_CONTEXT`, commits the host's
values, and `useCarouselState` issues it **during render**, guarded by identity:

```ts
if (
  state.layout !== layout ||
  state.config !== config ||
  state.isInstantMode !== isInstantMode
) {
  dispatch({ type: "SYNC_CONTEXT", layout, config, isInstantMode });
}
```

A render-phase update is re-run before the commit, so the context is in the
state before any child effect or handler can dispatch — the guarantee the ref
existed to provide, without the ref. `layout` and `config` are memoised
upstream, so the guard compares identities and settles in one pass.

`SYNC_CONTEXT` is also where the layout reconcile happens, which makes the
context boundary the reconcile boundary.

## Consequences

- `dispatch` is `useReducer`'s own dispatch: stable because React makes it so,
  not because a callback was pinned with an empty dependency array. No refs are
  written during render anywhere in the module, and the last exemption for
  `react-hooks/refs` is gone.
- One source for each value. Nothing can read a layout the state was not
  reconciled against, because there is no second copy to disagree with.
- The reducer is a reducer: `(state, command) => state`, with nothing arriving
  from outside a command.
- **This supersedes the two-boundary rule of
  [ADR-001](./0001-layout-reconciliation.md).** There is no render-time
  projection of a physical state any more — `SYNC_CONTEXT` reconciles and
  commits in one step, at one boundary. Everything else ADR-001 decided stands,
  including the idempotence contract on `reconcileStateToLayout`.
- A state fixture now carries a context, so tests build one through
  `makeState` (or a suite-local helper when the suite tunes its own config), and
  a test that used to hand a layout in per command syncs it first. The behaviour
  each test pins did not change.
