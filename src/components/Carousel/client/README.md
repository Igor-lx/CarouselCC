# Carousel

A React carousel component: compositor-driven motion (one WAAPI path for every
planned ride), touch gestures with inertial release, responsive art-directed
images, and a dev-only diagnostic layer that compiles out of production.

This folder is the **portable unit** — copy its contents into a project and it
runs, pulling only from the trimmed `shared/` shelf it ships beside. It detects
nothing about its environment: the host injects `userEnvironment` and the
component stays a pure function of its props.

## Minimal usage

```tsx
import Carousel from "<carousel>";
import { Pagination } from "<carousel>/modules/Pagination";
import { Controls } from "<carousel>/modules/Controls";

<Carousel slidesData={slides}>
  <Pagination />
  <Controls />
</Carousel>
```

Full props, slot children, DOM contract and the slide-data shape are in
[docs/architecture/public-api.md](./docs/architecture/public-api.md).

## Documentation

- **[docs/architecture/](./docs/architecture/)** — how it works, by area:
  - [overview.md](./docs/architecture/overview.md) — ownership, SSOTs, folder map, reading order
  - [public-api.md](./docs/architecture/public-api.md) — the product contract
  - [motion.md](./docs/architecture/motion.md) — controller, segments, handoff, teleport, compositor
  - [gesture.md](./docs/architecture/gesture.md) — swipe engine, slot-normalized tuning, coasted launch
  - [state.md](./docs/architecture/state.md) — the reducer state machine
  - [slides.md](./docs/architecture/slides.md) — render window, image resources, rendering
  - [viewport.md](./docs/architecture/viewport.md) — breakpoint/orientation axes, attribute-driven styling
  - [modules.md](./docs/architecture/modules.md) — the slot modules
  - [diagnostics.md](./docs/architecture/diagnostics.md) — the observe-only dev layer
  - [quality.md](./docs/architecture/quality.md) — trade-offs and quality protections
- **[docs/adr/](./docs/adr/)** — the decisions with lasting consequences:
  - [ADR-001](./docs/adr/0001-layout-reconciliation.md) — one pure reconcile rule, two boundaries
  - [ADR-002](./docs/adr/0002-trusted-runtime-inputs.md) — trusted runtime inputs, external validation boundary
  - [ADR-003](./docs/adr/0003-single-compositor-path.md) — one compositor path for every planned motion

New to the code? Follow the reading order at the end of
[overview.md](./docs/architecture/overview.md).
