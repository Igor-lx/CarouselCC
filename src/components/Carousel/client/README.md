# Carousel

A React carousel component: compositor-driven motion (one WAAPI path for every
planned ride), touch gestures with inertial release, responsive art-directed
images, and a dev-only diagnostic layer that compiles out of production.

It is self-contained and detects nothing about its environment: the host injects
`userEnvironment` and the component stays a pure function of its props. Where it
needs a general-purpose primitive it takes it from the project's shared library.

## Minimal usage

```tsx
import Carousel from "./Carousel";
import { Pagination } from "./Carousel/modules/Pagination";
import { Controls } from "./Carousel/modules/Controls";

<Carousel slidesData={slides}>
  <Pagination />
  <Controls />
</Carousel>
```

Full props, slot children, DOM contract and the slide-data shape are in
[docs/architecture/public-api.md](./docs/architecture/public-api.md).

## Documentation

The rationale lives entirely in `docs/`; the code carries only short traps and a
`// See docs/architecture/<layer>.md` link at the top of each file. There is one
architecture doc per layer folder.

- **[docs/architecture/](./docs/architecture/)** — how it works:
  - [overview.md](./docs/architecture/overview.md) — ownership, SSOTs, folder map, reading order
  - [public-api.md](./docs/architecture/public-api.md) — the product contract
  - [state.md](./docs/architecture/state.md) — the reducer state machine, step resolution
  - [domain.md](./docs/architecture/domain.md) — the pure core: layout, transforms, windowing, visibility
  - [motion.md](./docs/architecture/motion.md) — controller, segments, handoff, teleport, compositor
  - [visual-position.md](./docs/architecture/visual-position.md) — the visible-position SSOT, fallback pacing
  - [geometry.md](./docs/architecture/geometry.md) — slot measurement, track binding, the two paint owners
  - [gesture.md](./docs/architecture/gesture.md) — swipe engine, slot-normalized tuning, coasted launch
  - [slides.md](./docs/architecture/slides.md) — render window, image resources, rendering
  - [viewport.md](./docs/architecture/viewport.md) — breakpoint/orientation axes, attribute-driven styling
  - [presentation.md](./docs/architecture/presentation.md) — the JS→CSS contract, the lane-style cache
  - [styling.md](./docs/architecture/styling.md) — the stylesheet: rules, tuning vars, rendering traps
  - [context.md](./docs/architecture/context.md) — module context, split by update cadence
  - [navigation.md](./docs/architecture/navigation.md) — the public command handlers
  - [autoplay.md](./docs/architecture/autoplay.md) — the interval loop and its adapter
  - [focus.md](./docs/architecture/focus.md) — focus recovery on settle
  - [host-report.md](./docs/architecture/host-report.md) — the `onCarouselStatusChange` snapshot
  - [render-policy.md](./docs/architecture/render-policy.md) — the single owner of slot gating
  - [slots.md](./docs/architecture/slots.md) — the slot vocabulary and component contract
  - [modules.md](./docs/architecture/modules.md) — the slot modules
  - [diagnostics.md](./docs/architecture/diagnostics.md) — the observe-only dev layer
  - [quality.md](./docs/architecture/quality.md) — trade-offs and quality protections
- **[docs/config/](./docs/config/)** — what every tuning constant governs, one
  file per `config/` file (the values live in the code; the docs explain them).
- **[docs/adr/](./docs/adr/)** — the decisions with lasting consequences:
  - [ADR-001](./docs/adr/0001-layout-reconciliation.md) — one pure reconcile rule, two boundaries
  - [ADR-002](./docs/adr/0002-trusted-runtime-inputs.md) — trusted runtime inputs, external validation boundary
  - [ADR-003](./docs/adr/0003-single-compositor-path.md) — one compositor path for every planned motion

New to the code? Follow the reading order at the end of
[overview.md](./docs/architecture/overview.md).
