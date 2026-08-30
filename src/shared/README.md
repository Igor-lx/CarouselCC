# shared

A general-purpose library — a shelf of reusable, self-contained blanks, not a
dependency graph shaped by any one app. Take a whole area, one folder, or a
single hook; each carries what it needs so it can be lifted out on its own.

Everything public is re-exported from the barrel (`index.ts`); each area has its
own README with the detail.

| Area | What |
| --- | --- |
| [`clientState/`](./clientState/README.md) | What the client reports about itself, reactively — viewport media conditions (`media/`) and user-environment signals (`environment/`), over one shared `matchMedia` store. |
| [`viewportObservation/`](./viewportObservation/README.md) | Observe live viewport state via DOM/activity observers (visibility, "busy") — not CSS media queries. |
| [`theme/`](./theme/README.md) | Light / dark / auto theme box: state + `data-theme` + optional mobile browser-chrome sync. |
| [`engines/`](./engines) | The motion, gesture, and kinetic engines (curves, swipe recognition, compositor). A large area with its own docs. |
| [`focus/`](./focus/README.md) | `manageFocusShift` — focus recovery out of an `inert` subtree. |
| [`slots/`](./slots/README.md) | `resolveSlots` — resolve React children into named slots. |
| [`styles/`](./styles/README.md) | `mergeStyleMaps` — merge CSS-module class maps. |
| [`icons/`](./icons/README.md) | Inline SVG icon components. |
| [`math/`](./math/README.md) | Numeric type guards for validating config/props/constants. |
| [`hooks/`](./hooks/README.md) | Generic cross-cutting React helpers (`useIsomorphicLayoutEffect`). |

**Conventions.** Each blank keeps its own copies of the hooks it uses (duplicating
a pure function costs nothing); the one thing never duplicated is a store — see
`clientState/sharedStore` for the media-query stores. Code carries minimal
comments (traps and doc links only); the rationale lives in these READMEs.
