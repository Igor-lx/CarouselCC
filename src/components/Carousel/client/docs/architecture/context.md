# Module context

How the carousel exposes state to its slot modules. A slot child cannot be
handed props by the carousel (the host writes the JSX), so everything a module
needs reaches it through React context. This layer owns the shape of that
context and the hook that builds its value.

## Partitioned by update cadence

The module context is split into two values so that a high-frequency change never
re-renders consumers that only read low-frequency data. This is the layer's
central decision.

- **Stable / low-frequency half** (`CarouselStableContextValue`). "Stable" means
  *changes rarely*, not never. `navigation` is referentially fixed for the
  carousel's life; `visualPosition` re-identifies only when reduced-motion
  toggles; `layout` re-identifies only on a boundary or config change (reaching
  a deck edge, a data replacement) — never on an ordinary mid-deck step. A
  consumer that reads only this half (`<Controls>`, the widget's diagnostic) does
  not re-render on every click.
- **Motion / high-frequency half** (`CarouselMotionContextValue`). `status`
  (motion phase / idle / moving …) and `intent` (target page) change on every
  click, gesture, and settle. The consumers that read this half (`<Pagination>`,
  `<PaginationWidget>`) legitimately re-render on those transitions — that is
  their job.

Keeping the two apart is the whole point: routine steps re-render only the
modules that actually track motion.

## What the stable half carries, and why

- **`layout`, `navigation`** — the shape of the deck and the click handlers.
- **`visualPosition`** — the per-frame position source; modules subscribe to it
  directly rather than through React values.
- **`motionPlan`** — the engine's motion-plan stream (see [motion](./motion.md)):
  each non-drag motion is computed once and published as a duration plus a
  progress curve, so a paint consumer (PaginationWidget) can build its own
  compositor animation from it. `null` under reduced motion, so modules fall back
  to static rendering.
- **`trackRef`** — the track element, handed to modules that must read what the
  deck has ACTUALLY rendered rather than re-derive it. `<ResponsiveImages>` reads
  the buffered images' `currentSrc` from here — the browser's own candidate
  choice, which cannot disagree with the markup the way a parallel computation
  can. A ref object is referentially stable, so exposing it costs no re-render.
- **`slides`** — deck-order art-direction descriptors, image slides only. Its
  ONLY consumer is the Diagnostic slot, which checks that each slide's
  `<source media>` is one of the carousel's canonical axis strings so a crop can
  never silently flip on a threshold the slide box does not. Built only in
  development; there is no production consumer.
- **`isOffBandFetchOn`** — the bandwidth gate (see [slides](./slides.md)): `true`
  once the visible band has reported back, the deck is at rest, and the buffered
  slides may fetch. Before it flips, the buffer's images are not mounted at all.
- **`isPaginationInteractiveOn`** — a behaviour flag that reaches the dots the
  only way it can (through context, not props); off renders them as inert.

## The diagnostic context

A separate context (`CarouselDiagnosticContextValue`) feeds the dev-only
Diagnostic slot. Its values MIRROR exactly what the runtime sees — the Diagnostic
layer must never read mutated or filtered copies, or its observations would
diverge from reality (see [ADR-002](../adr/0002-trusted-runtime-inputs.md)). It
carries the full effective `CarouselState` (so the structural-invariant validator
consumes it directly), the raw props as received, the layout-shape metrics
(including both the requested and the effective visible-slides count, so a
correct down-clamp can be surfaced as an adaptation rather than an error), and
the slot-attachment facts.

## Building the value

`useModuleContextValue` assembles both halves. Each sub-view is memoised on its
own inputs, and the status view is derived from the single source
(`state.motionPhase`) rather than taking a parallel pre-derived object — one
input, so the status booleans cannot drift apart from the phase.

`useDiagnosticContextValue` builds the diagnostic value the same way (raw props
plus observable layout/slot facts, independently memoised sub-views), with one
production optimisation. The render policy does not attach Diagnostic in
production, so nothing reads this context there — and building the value anyway
would mean a fresh object and a re-identified provider on every dispatch, twice
per ride, in the two frames the carousel can least afford it. So in production the
hook returns one frozen, shape-complete stand-in that is never read; the real
sub-views are built only under `IS_DEV`, and their object literals drop out of
the production bundle with that branch.

The raw props are passed exactly as the caller wrote them, `undefined` included:
the Diagnostic layer audits what the user wrote, not the resolved config.
