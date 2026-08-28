# Diagnostics

A development-only observer. It reads runtime values, checks them, and warns —
it never normalises, validates into, repairs, or substitutes any value the
carousel uses. This is a direct consequence of the trusted-inputs model
([ADR-002](../adr/0002-trusted-runtime-inputs.md)): the runtime performs no
repair, so Diagnostic has none to mirror.

## Zero production cost

The whole layer is a build-time development tool. In a production build it does
literal zero work AND is physically absent from the bundle. The guarantees, from
outermost to innermost:

- **The slot never mounts.** The render policy gates attachment on `IS_DEV`
  (`isDiagnosticAttached = hasDiagnosticSlot && IS_DEV`,
  [`render-policy/useModuleRenderPolicy.ts`](../../render-policy/useModuleRenderPolicy.ts)).
  A host may leave `<Diagnostic />` in its JSX permanently — it resolves to
  `null` in production.
- **The collectors are `IS_DEV`-gated** in
  [`modules/Diagnostic/Diagnostic.tsx`](../../modules/Diagnostic/Diagnostic.tsx)
  and [`useWidgetDiagnostic.ts`](../../modules/Diagnostic/useWidgetDiagnostic.ts),
  so the branches — and with them the `checks/` imports and every check string —
  are dead code the bundler drops.
- **The diagnostic context builds nothing** in production:
  [`context/useDiagnosticContextValue.ts`](../../context/useDiagnosticContextValue.ts)
  returns a frozen `SILENT_VALUE` and its sub-views are `IS_DEV`-gated, so no
  props/layout/slot object is assembled per dispatch.
- **The check modules have no module-level side effects.** Lookup tables are
  built inside the collectors (`buildNumericRules`, lazy `Set` factories in
  `viewportChecks`), never as top-level `const`s — a top-level `.map()` or
  `new Set()` is a side effect the bundler cannot prove pure, and it would keep
  the module (and its strings) alive in production even behind a dead branch.

This is verified against the built bundle, not just by reading gates: no check
string from any of the five check files survives in production.

## What each check verifies

Checks are pure and come in two forms:

- **Field rule** — a value against a predicate (`shared/math/numeric` guards),
  with `severity`, `expected`, `consequence`.
- **Relation rule** — an invariant across several values (`minPx <= maxPx`; the
  swipe share at the reference slot landing inside the clamps; veil cap ≥ fade
  round-trip).

Check sets under [`modules/Diagnostic/checks/`](../../modules/Diagnostic/checks):

- **`propChecks`** — public input validity.
- **`constantChecks`** — internal tuning-constant ranges and relations.
- **`layoutChecks`** — page-layout consistency (perfect-page coverage,
  `canSlide`/`pageCount`, and the `visibleSlidesNr > deck length` coercion
  report).
- **`viewportChecks`** — the axes (finite/unique/`0`-tier), that canonical media
  strings parse in this browser, that live slide `<source media>` uses canonical
  strings, and a two-directional CSS name contract (every `data-breakpoint` /
  `data-orientation` selector names a real state; every declared tier/flag is
  referenced by some stylesheet — or deliberately isn't).
- **`stateChecks`** — structural state invariants (via `state/validateState`).
- **`widgetChecks`** — PaginationWidget prop sanity (`visibleDots` an odd
  integer at or above its floor, `scaleFactor` in the open unit interval,
  positive pixel sizes).

## Two collectors, one emitter

Everything the carousel can reach from the diagnostic context is checked inside
the `<Diagnostic />` slot. The PaginationWidget's own tuning props are the
exception: they are written on the slot element by the host and never pass
through the carousel, so they are structurally unreachable from the context.
`useWidgetDiagnostic` collects them at the widget, and
`WidgetDiagnosticInput` is a mapped type over the widget's props — a new widget
prop fails the build until an audit decision is made, so the check list can never
silently drift from the props.

Both collectors feed one emitter,
[`useGroupedWarnings`](../../modules/Diagnostic/useGroupedWarnings.ts): dedupe by
signature (so StrictMode double-invokes and stable inputs don't spam), then one
`console.warn` per warning. The widget collector additionally runs only when a
Diagnostic slot is attached (`layout.isDiagnosticActive`).

## Warning shape and format

`CarouselDiagnosticWarning` is `{ severity, layer, field, actual, expected,
consequence }` — a closed shape. Anything case-specific rides inside `actual`
(typed `unknown`); the shape does not grow a field for one call site. The line
([`formatter.ts`](../../modules/Diagnostic/formatter.ts)):

```
[Carousel Diagnostic][SEVERITY] <Layer> -> <field> has value <actual>. \
<Expected …>. <Consequence>. Diagnostics is observe-only and does not apply \
runtime changes.
```

`SEVERITY` is `CRITICAL` or `LOGICAL`. Diagnostic only ever describes a value
and its consequence — it never claims a runtime repair, because the runtime
performs none. There is deliberately no "normalized to" clause in the shape.

## Observe-only in practice

There is no runtime normalization anywhere for Diagnostic to describe, so every
would-be "silent correction" is instead a plain warning:

- **Over-allocated profile shares** (accel + decel > 1) — the engine uses the raw
  shares; Diagnostic reports the misconfiguration ([motion.md](./motion.md)).
- **`visibleSlidesNr` > deck length** — the runtime coerces the visible band down
  to the deck (a correct, load-bearing adaptation); Diagnostic reports
  "requested N, deck M, used M" ([slides.md](./slides.md)).
- **GO_TO ramp budget over its span** — the flight timing uses the raw share;
  Diagnostic reports the over-budget ([gesture.md](./gesture.md) covers the
  parallel swipe-share checks).
