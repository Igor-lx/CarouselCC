# `shared/` — a collection of copy-portable building blocks

A general-purpose library for **any** consumer, never shaped by the carousel.
Its one organising idea:

> **Every capability folder is self-sufficient and copy-portable.** Each
> imports **only React and itself** — nothing from a sibling folder — so you
> can copy that one folder into a completely different project (or another
> machine) and it just works. A `tests/portability.test.ts` lives inside each
> folder and enforces the rule; it travels with every copy.

Self-sufficiency is achieved **by duplication, not by imports.** When a folder
needs a primitive another folder also has, it carries its **own copy**. The
copies may drift over time — that is the design, not an accident: each folder
is a standalone заготовка you pick by task, not a node in a dependency graph.

## Two shapes

- **library** — a folder of individual standalone hooks. Grab exactly the one
  you need.
- **facade package** — one hook that composes several primitives into a single
  call. Uniform layout: all implementation (including **copies** of the
  primitives it uses) lives under `internal/`, guards under `tests/`,
  `index.ts` is the one public surface, and the **one facade hook sits at the
  root, named after itself** (folder `useMedia/` exports `useMedia`).

## Map

```
shared/
  engines/                 the motion/gesture engines + the fused blank
    motion/                a value travels beautifully (curves + RAF runtime)
    gesture/               finger → intent (swipe + inertial release)
    kinetic/               turnkey blank: drag + fly in ONE hook;
                           internal/ FORKS motion + gesture
  media/                   reactive CSS media-query capabilities
    library/               useMediaQuery, useBreakpoint, useOrientation,
                           useShortLandscape (standalone hooks)
    useMedia/              FACADE: useMedia(axes) → { breakpoint, orientation,
                           flags, matches, signature }; internal/ FORKS the
                           primitives it uses
  environment/             user-environment signals
    library/               useIsReducedMotion, useIsTouchDevice, useDataSaver
    useUserEnvironment/    FACADE: one memoised object; internal/ FORKS the signals
  viewportObservation/     OBSERVE live viewport state via DOM/activity
                           observers (NOT media queries): useViewportVisibility,
                           useViewportBusy
  hooks/                   misc generic React helpers (useIsomorphicLayoutEffect)
  math/ focus/ icons/ slots/ styles/   small pure utilities
  index.ts                 the one barrel every consumer imports from
```

(`engines/`, `media/`, `environment/` are grouping folders; the self-contained
units are the leaf folders inside them — each with its own portability guard.)

## Rules of the collection

- **A folder imports only React and itself.** Cross-folder needs are met by a
  local copy, never an import. The portability guard fails the build otherwise.
- **Engines never import each other**; `kinetic` is self-sufficient by
  duplicating their logic.
- **`media` is matchMedia only.** Viewport things that observe the DOM
  (`viewportObservation`) are a different mechanism and live apart.
- Each unit is judged as a library primitive on its own merits — "the carousel
  doesn't use it" is never a reason to remove a coherent hook.
