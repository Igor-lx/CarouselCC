# Overview

The carousel component. It is self-contained and a pure function of its props —
it detects nothing about its environment; the host injects `userEnvironment`.
Where it needs a general-purpose primitive (a swipe engine, a media store, the
motion engine) it takes it from the project's shared library. This document is
the map; the area docs beside it go deep.

## Ownership model

Every responsibility has exactly one owner; the orchestrator
([`Carousel.tsx`](../../Carousel.tsx)) wires them. Each hook returns exactly the
shape it owns, no hook reads another hook's internal state, and cross-layer
values flow only through hook arguments and the context provider.

| Concern | Owner |
| --- | --- |
| Public props (frozen contract) | `Carousel.tsx` / `public-api/types.ts` |
| User environment | host application (injected via `userEnvironment`; the carousel never detects touch / reduced-motion / data-saver itself) |
| Resolved runtime config | `config/resolve/useCarouselConfig` — defaults for `undefined` props only; never normalises explicit values, and nothing downstream does either |
| Slide records + layout facts | `slides/useCarouselSlideDeck` |
| Logical state | `state/useCarouselState` (reducer-backed) |
| Visual sampled position | `visual-position/useVisualPosition` — sole SSOT for the visible track offset |
| Motion execution | `motion/useCarouselMotionExecution` + `motion/useMotionRunner` |
| Track DOM + compositor animation | `geometry/useTrackBinding` |
| Render window | `slides/useSlideRenderModel` |
| Image resources | `slides/imageResource/*` (one store per carousel; the authority on renderability) |
| Gesture lifecycle | `gesture/useCarouselGesture` (wraps shared `usePointerSwipe`) |
| Autoplay lifecycle | `autoplay/useCarouselAutoplay` over `autoplay/useAutoplay` (component-local, not a shared engine) |
| Focus shift | `focus/useFocusRecovery` |
| Module API context | `context/useModuleContextValue` |
| Host status snapshot | `host-report/useCarouselStatusReporter` |
| Module render policy | `render-policy/useModuleRenderPolicy` (single owner of slot-attachment gates) |
| Diagnostic warnings | `modules/Diagnostic` — observe-only, dev-only; never owns or replaces runtime values (see [ADR-002](../adr/0002-trusted-runtime-inputs.md)) |

## Single source of truth

Five SSOTs, each owned by exactly one layer. No layer mirrors another's value.

1. **Logical state** — `useCarouselState`. `targetPageIndex`, `fromVirtualIndex`,
   `virtualIndex`, optional `teleportVirtualIndex`, `isTeleportApproach`,
   `motionPhase`, `gesture` (velocity payload of the latest END_DRAG),
   `isRepeatedClickAdvance`, `moveReason` — plus the context the reducer decides
   with, `layout`, `config` and `isInstantMode`, which are state and not
   per-command arguments (ADR-004). No timing. Reducer-pure.
2. **Visual sampled position** — `useVisualPosition`. The motion controller's
   `value`/`velocity`/`target` are the only authority on "where the track is
   right now". Everything per-frame subscribes here.
3. **Layout facts** — `useCarouselSlideDeck`'s memoised `layout`. Derived from
   props; recomputed only when inputs change.
4. **Runtime config** — `useCarouselConfig`. Defaults for `undefined` props
   only; never coerces, clamps, or repairs explicit values.
5. **Image resources** — the per-carousel image-resource store. One entry per
   URL: render `status` + retry `generation`. Observation-only; never feeds
   navigation, layout, or motion.

The state machine never reads a sampled motion value — the gesture controller
reads the visual position and passes it *into* the dispatch payload. The visual
position never reads logical state; the motion runner is the only bridge.

## Folder map

```
Carousel.tsx            composition root, no business logic
public-api/             the product contract — props, Slide, handle, schemas
config/                 config resolution (defaults, motion shares, gesture, viewport)
context/                module + diagnostic React contexts, split by update cadence
domain/                 pure functions, no React (math, layout, windowing, visibility)
state/                  reducer-backed state machine + layout reconciliation
motion/                 carousel motion SEMANTICS over the shared motion engine
visual-position/        the visible-position SSOT (wraps one MotionController)
geometry/               slot measurement + track transform writer + WAAPI compositor
gesture/                pointer-swipe → dispatch + direct position writes
autoplay/               generic interval loop + carousel adapter
navigation/             public click handlers
focus/                  focus recovery on settle
host-report/            deduplicated onCarouselStatusChange emission
presentation/           class names, CSS vars, state attributes
slides/                 SlideItem, render window, image-resource SSOT
viewport/               breakpoint/orientation resolution for the deck
slots/                  slot names + CarouselSlotComponent contract
render-policy/          single owner of slot-attachment / render gating
modules/                slot children:
  Controls/
  Pagination/           basic/ (dots) + widget/ (scaling strip)
  ResponsiveImages/     headless: presence switch + idle predecode manager
  Diagnostic/           dev-only observer (checks/) — see diagnostics.md
docs/                   this documentation set (adr/ + architecture/)
```

Detail per file lives in the folder itself — this map stays at folder altitude
on purpose, so it does not rot every time a file is added.

## Reading order for someone new

1. `public-api/types.ts` — the public surface.
2. `Carousel.tsx` — top-down composition.
3. `state/types.ts` + `state/reducer.ts` — what the carousel knows about itself
   ([state.md](./state.md)).
4. `motion/types.ts` + `motion/segmentFactory.ts` — a logical step becomes a
   visual segment ([motion.md](./motion.md)).
5. `visual-position/useVisualPosition.ts` — how the visible position is sampled.
6. `motion/useMotionRunner.ts` — a state change becomes a controller start; the
   handoff invariant.
7. `geometry/useTrackBinding.ts` — the track DOM write and the compositor
   hand-off.
8. `gesture/useCarouselGesture.ts` — a touch swipe becomes a dispatch
   ([gesture.md](./gesture.md)).
9. The modules ([modules.md](./modules.md)).
