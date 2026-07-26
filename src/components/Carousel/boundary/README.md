# Carousel boundary

Neutral ground above the carousel's two halves. This folder holds the
architecture tests that guard the seam between them — and it lives *above* both
halves on purpose, so a test here may import from either side without itself
crossing the boundary it enforces.

## The two halves

- **`client/`** — the browser component. It ships in the app bundle and must stay
  free of Node APIs.
- **`data-gen/`** — a Node-only kit that generates the responsive image assets
  (art-directed crops, width variants) the component consumes. It is meant to be
  copied to wherever the source images live and run there; it never runs in the
  browser.

They are deliberately decoupled: the component knows nothing about how its assets
were produced, and the generator knows nothing about the component's internals.
The two tests here turn that decoupling from a convention into a CI invariant.

## `boundaries.test.ts` — independence

Scans the source of both halves and asserts:

- **`client/` never imports `data-gen/`.** This is what keeps the Node-only
  generator — and `node:fs` with it — out of the browser bundle. A single stray
  import would pull server-only code into the shipped app.
- **`data-gen/` is self-contained** — no import escapes the folder (`../`). Bare
  npm deps and `node:*` are fine; a `../` reach into `client/`, `shared`, or the
  app would break the "copy this folder to a server and run it" guarantee.

It also asserts there is real source on both sides, so a wrong path can't make the
scans pass vacuously by finding nothing.

## `slide-contract.test.ts` — the type seam

The one place the two halves touch: the slide object the generator EMITS must be a
valid component `Slide`. Because `GeneratedSlide` (data-gen) and `Slide` (client)
are defined independently to keep the halves decoupled, nothing else guarantees
they stay compatible. The test is a compile-time contract — a
`const asSlide: Slide = generated` assignment that fails `tsc` if `GeneratedSlide`
ever drifts out of `Slide` (a renamed field, a widened type).

## Why it matters

Both invariants are silent until they break — a bundle bloated with `node:fs`, or
a generator quietly emitting slides the component rejects — and both would surface
far from their cause. These tests fail fast, at the boundary, in CI.
