# Trade-offs and quality protections

## Deliberate trade-offs

- **Environment is injected, not self-detected.** The carousel never reads
  `matchMedia` / `navigator`; `reducedMotion` / `touch` / `dataSaver` arrive via
  `userEnvironment`. This keeps it a pure function of its props — SSR-safe,
  testable without global mocks, one environment source. The cost is lost
  zero-config: a host that fails to wire `useUserEnvironment` gets full motion,
  desktop behaviour, no data-saver skip — made loud by Diagnostic, not silently
  repaired. Reduced motion is the one signal where that trade is not settled:
  in dev the host hears about it, in production nobody does, and the reader who
  asked their OS for less motion gets all of it. The open decision — required
  prop, internal fallback, or fallback with an explicit opt-out — is written up
  with its costs in `.context/02-todo.md`, and it changes the public contract,
  so it lands as its own ADR rather than as an edit here.
- **Per-frame DOM mutation** in the track binding and PaginationWidget bypasses
  React deliberately. The alternative — state/context per frame — would re-render
  every consumer at 60 Hz for purely visual data. Contained: both hooks own their
  refs and subscribe through the one visual-position API.
- **The compositor is a second paint path, not a second SSOT.** A planned
  segment's track translation runs on the compositor via WAAPI while the JS
  controller still samples the same curve for every other consumer — the motion
  is expressed twice (JS samples + a keyframe list), and the binding suppresses
  its per-frame write so they don't fight. The alternative keeps one expression
  but puts the heaviest per-frame write back on the main thread, where it drops
  frames under commit/decode/paint contention. Fallback is
  total (no `Element.animate` → JS write), so the duplication never forks
  correctness: the JS controller stays the single authority on where the deck is
  ([ADR-003](../adr/0003-single-compositor-path.md)).
- **Per-instance singletons flow explicitly**, not via an internal context. The
  visual position and the image-resource store are taken as explicit dependencies
  (the store is passed straight into each `SlideItem`); the only React contexts
  are the cadence-partitioned module API ([motion.md](./motion.md)), a
  deliberate module boundary, not internal wiring.
- **The state machine reads `fromVirtualIndex` from the dispatch site**, never by
  reaching into the controller — keeping it pure and testable without DOM/RAF.
- **The render window keeps its expanded shape during a segment**, shrinking only
  on settle, so a slide is never unmounted mid-flight; it costs at most one extra
  rendered slide pair during fast direction switches.

The trusted-inputs boundary and the observe-only Diagnostic contract are
[ADR-002](../adr/0002-trusted-runtime-inputs.md); the callback / imperative-handle
guarantees are in [public-api.md](./public-api.md).

## Quality protections

- **TypeScript.** Discriminated unions for `CarouselCommand`, `MotionPhase`,
  `MoveReason`, `CarouselSegment`, `CarouselMotionIntent`. No `any`.
- **Public Zod schemas, scoped to one job.** Validating the slide-data document
  before it is passed as `slidesData`. `CarouselSlidesDataSchema` is the single
  public entry, and the `Slide`-family schemas it is built from are the **single
  source of truth** the public `Slide` / `SlideImageVariants` / `SlideImageSource`
  types are inferred from (`z.infer`) — validated shape and type cannot drift.
  There are no prop/callback schemas. Exported only from `public-api/schemas`,
  deliberately NOT re-exported from the barrel or entry, so Zod stays out of the
  app bundle unless a host opts in with an explicit deep import. The component
  never runtime-validates — invalid input propagates and Diagnostic surfaces it.
- **React safety.** Per-frame work never touches React state; dispatches are
  batched; effects are pure with explicit cleanup; `useIsomorphicLayoutEffect`
  for DOM measurement and synchronous visual coordination.
- **Strict Mode.** Controller cleanups handle remount; the visual-position
  subscription returns a cleanup that disconnects from the controller.
- **Runtime safety.** Layout reconciliation tolerates page-count changes and
  resets on `dataKey`. Numeric inputs are not coerced or repaired; there is **no
  runtime normalization at all** — even over-allocated accel/decel shares are
  trusted (the engine drops the negative cruise zone), and Diagnostic surfaces
  violations without feeding back ([diagnostics.md](./diagnostics.md)).
- **Performance.** Every engine-planned motion runs on the compositor via WAAPI
  with the profile stop-encoded into keyframes: the math is computed once per
  motion (profile + progress stops + keyframes) and no per-frame JS runs while it
  plays, for the track or the widget. Per-frame writes remain only for finger-drag
  follow and the no-WAAPI fallback (both dropping the same Nth frames via the
  shared pacing rule); the track binding short-circuits redundant transforms and
  the widget short-circuits per dot against position/scale/opacity epsilons
  ([`modules/Pagination/widget/defaults.ts`](../../modules/Pagination/widget/defaults.ts)).
  The controller emits only on actual sample change. Image prioritization is
  native `<img>` hints, and the pre-mounted render-window buffer has every
  reachable slide fetching while idle — no speculative warm-up machinery runs.
