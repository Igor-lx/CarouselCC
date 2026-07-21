# `shared/` — a storage of blanks (заготовки)

This is **not** an import graph to build against — it is a **shelf of
copy-ready blanks**. You take what you need into a real project: one single
hook, a whole library, one facade, several at once, in any combination.

Two consequences shape everything here:

1. **A blank carries its own copies.** Each folder duplicates the hooks it
   uses instead of importing a neighbour, so lifting one folder never leaves
   a piece behind. Duplicated pure logic costs nothing and may drift — by
   design.
2. **State is never duplicated.** A *store* (one browser listener registry
   shared by all its consumers) must exist **once** in a project. So every
   store lives in a visible `shared/` folder next to the blanks that use it —
   you see at a glance that it must travel with your copy **and** that you
   keep exactly one of it, no matter how many blanks you took.

```
shared/
  engines/                 motion / gesture / kinetic — fully self-contained
                           blanks (kinetic forks the other two into internal/);
                           each keeps its own tests/portability.test.ts
  clientState/             what the client reports about itself right now
    shared/
      useMediaQuery.ts     THE store — one per project, take it along
    media/                 viewport tiers, orientation, media conditions
      library/             standalone hooks (useBreakpoint, useOrientation,
                           useShortLandscape)
      useMedia/            FACADE: useMedia(axes) → { breakpoint, orientation,
                           flags, matches, signature }; internal/ holds its own
                           copies of the hooks it uses
    environment/           user signals
      library/             useIsReducedMotion, useIsTouchDevice, useDataSaver
      useUserEnvironment/  FACADE: one memoised object; internal/ holds its own
                           copies
  viewportObservation/     observe live viewport state via DOM/activity
                           observers (NOT media queries): useViewportVisibility,
                           useViewportBusy
  hooks/                   misc generic React helpers (useIsomorphicLayoutEffect)
  math/ focus/ icons/ slots/ styles/   small pure utilities
  index.ts                 the barrel this repo's own code imports from
```

## Copying a blank out

1. Copy the folder(s) you want — any mix of libraries and facades, from one
   or several domains.
2. If a copied folder imports a `shared/` file (today: only
   `clientState/shared/useMediaQuery`), copy that file too — **once** — put it
   wherever you like and point the copied imports at it.
3. That is the whole procedure. Nothing else reaches outside a blank.

## Why the stores are the exception

Duplicating a pure function (a resolver, a query constant) is free: two
copies compute the same answer. Duplicating a **store** is not: each copy
keeps its own registry, so the same media query would be watched by two
independent listeners and the "one listener per query" guarantee would only
hold per copy. Hence: pure logic duplicated freely, stores shared and single.

## On portability tests

The `engines/` blanks import nothing but React and themselves, so each keeps
a `tests/portability.test.ts` guard. The `clientState/` blanks deliberately
import one file from `shared/`, and in a target project that file may live
anywhere, so a "react + self only" guard would always fail there and was
dropped. The invariant worth guarding instead is *"exactly one copy of each
store"* — visible directly from the layout above.

## Rules of the collection

- **Engines never import each other**; `kinetic` duplicates their logic.
- **`clientState/media` is matchMedia only.** Viewport things that observe
  the DOM (`viewportObservation`) are a different mechanism and live apart.
- Each unit is judged as a library primitive on its own merits — "the
  carousel doesn't use it" is never a reason to remove a coherent hook.
