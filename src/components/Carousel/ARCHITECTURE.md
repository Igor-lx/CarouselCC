# Carousel — Architecture

This document is the source of truth for the Carousel component's internal design.
It exists alongside the code and is updated whenever an architectural decision changes.

The reader should be able to start here, then open `Carousel.tsx` and follow the
composition top-down without surprises.

---

## 1. Why a rebuild instead of a refactor

The previous implementation (located in the sibling `test-deploy` project) had
many strong local pieces — a motion controller, a drag engine, a motion-profile
solver, a virtual-windowing helper, a slot resolver — but the system as a whole
suffered from:

- ownership ambiguity: state machine, motion controller, projection source, and
  DOM bridge each held overlapping snapshots of "where the carousel currently is";
- accidental coupling: a `motion-projection-source` layer with priorities and
  deferred frames sat between the controller and its consumers, but its priorities
  were never genuinely required and its deferred-frame branching obscured the
  data flow;
- mixed responsibilities inside the orchestrator: `Carousel.tsx` declared an
  18-hook pipeline that re-derived layout, reconciled state, planned motion, and
  wired modules — all readable in isolation, but with no top-down narrative;
- a special-cased `repeated-click` planner that lived half in the reducer and
  half in the motion-plan resolver, with `followUpVirtualIndex` flowing through
  three different layers before the runner consumed it.

The product behaviour was good and worth preserving. The implementation skeleton
was not.

This rebuild keeps the product contract (public props, demo experience, visual
states, gesture and click semantics, reduced-motion, autoplay, interruption
handling, repeated-click chaining, pagination response) and replaces the
skeleton with a layered design where each concern has exactly one owner.

The rebuild also keeps individual pieces of self-contained domain math from the
old code — a cubic-bezier sampler, a motion-profile solver, an EMA velocity
filter, a render-window expander. They are atomic, well-tested by inspection,
and ported into the new layout where appropriate. None of the old orchestration
hooks, module-context shape, reducer transitions folder, or motion-projection
layer survived as a structural element.

---

## 2. Product contract restored from test-deploy

These are user-facing facts the new implementation must keep. Sourced from
props, defaults, constants, styles, demo usage, and module behaviour.

### 2.1 Public API

`Carousel` accepts:

- `slidesData: Slide[]` where `Slide = { id, content, alt? }` and `content` is a
  trimmed-non-empty string, a number, or a React element;
- `visibleSlidesNr?: number` (default 3) — how many slides share the viewport;
- `isPagePaddingOn?: boolean` (default false) — when on, pads the deck with
  cloned tail slides so the deck length is a multiple of `visibleSlidesNr`;
- `durationAutoplay?: number` (default 3000), `intervalAutoplay?: number`
  (default 3000), `durationStep?: number` (default 2000), `durationJump?: number`
  (default 800) — timing inputs in milliseconds;
- `isContentImg?: boolean` (default true), `errAltPlaceholder?: string`
  (default `"Downloading Error"`);
- `isAuto?: boolean` (default true), `isPaginationOn?: boolean` (default true),
  `isControlsOn?: boolean` (default true), `isInteractive?: boolean`
  (default true), `isFinite?: boolean` (default false);
- `isInstantMotion?: boolean` — explicit override for prefers-reduced-motion;
- `isTouchDevice?: boolean` — explicit override for detected touch device;
- `className?: ClassNameMap` — partial map keyed by `outerContainer`,
  `innerContainer`, `slideContainer`, `slide`, `slideInteractive`, `slideError`,
  `slideText`;
- `onSlideClick?: (slide: Slide) => void`;
- `children?` — slots: `Pagination | PaginationWidget`, `Controls`,
  `Diagnostic`, attached by a `slot` static on the component.

The component renders a region with `role="region"`,
`aria-roledescription="carousel"`, exposes `data-touch` and `data-reduced-motion`
on the outer container, and a `data-carousel-track` track that owns the
horizontal translate transform.

### 2.2 Functional semantics worth preserving

- **Slide layout**: `pageCount = ceil(length / visibleSlidesCount)`. When
  `length <= visibleSlidesCount`, `canSlide` is false and the deck shows
  statically. When `!isFinite && canSlide`, the track behaves cyclically.
- **Step semantics**: `MOVE(+1)` advances by one page, `MOVE(-1)` retreats by
  one page, `GO_TO(pageIndex)` jumps over a possibly larger distance. In the
  infinite/cyclic mode `GO_TO` always travels the shortest cyclic distance.
- **Repeated click**: a click in the same direction while the previous click's
  motion is still running does not restart from scratch. Instead it plans a
  fast in-flight advance to `(1 + destinationPosition) * stepSize` of the
  current page (destination position 1 on desktop, 0.99 on touch), with a
  follow-up segment that normalises to a clean page boundary one full page
  further. The animation speed of that fast segment is roughly
  `REPEATED_CLICK_SPEED_MULTIPLIER` (4.5×) of a normal MOVE.
- **Opposite-direction click**: re-targets the motion without restarting from
  the current logical origin — the state machine reads the current sampled
  visual position as the new "from", so the new segment continues from where
  the user actually sees the track.
- **Drag / swipe**: pointer-driven, touch only. EMA-smoothed velocity, edge
  resistance with a configurable curvature. Release resolves to a swipe
  direction by either a quick-flick (raw velocity + raw offset) or a
  distance-based threshold (`SWIPE_THRESHOLD_RATIO` of the viewport width with
  a hard min). When intent is "NONE" the track snaps back to its origin via a
  snap-back curve.
- **Gesture interrupting motion**: starting a drag while the carousel is
  animating cancels the active motion. The drag starts from the visually
  sampled position, not the logical target.
- **Autoplay**: a `setTimeout(intervalAutoplay)` schedules the next step. It
  pauses when (a) the carousel is off-screen by less than the visibility
  threshold, (b) the user is dragging, (c) motion is in progress, (d) on
  desktop only, the pointer hovers the viewport (with a 150 ms debounce). On
  the final page in finite mode it loops back to page 0 via a GO_TO jump.
- **Reduced motion**: when prefers-reduced-motion or `isInstantMotion` is set,
  every transition snaps instantly. Gesture is disabled.
- **Pagination (dots)**: one dot per page. The active dot reflects the
  `targetPageIndex` immediately on click and gesture. During autoplay there is
  a deliberate delay (`AUTOPLAY_PAGINATION_FACTOR` × duration, default 20% of
  the animation) before the dot switches — this matches the test-deploy
  behaviour where autoplay rolls the pagination later than the visual.
- **PaginationWidget (touch)**: a fixed-width odd-count widget of dots with a
  spatial field (centre is largest, sides shrink exponentially). When
  reduced-motion is off, the widget binds to the visual position source and
  mutates its dots' transform/opacity per frame without re-rendering React.
  Two `activeDot` overlays interpolate between adjacent page indexes so the
  active highlight tracks the visual progress, not the logical target.
- **Slide click**: a slide is interactive when `isInteractive` is true, the
  image loaded successfully, and an `onSlideClick` handler was provided. The
  slide is rendered as a `<button type="button">` in that case, otherwise as
  a `<div>`. Slides outside the active visual band are `inert`.
- **Focus management**: when the carousel settles after a step, focus inside
  an out-of-band slide is moved to the focusable target of the active band
  via `manageFocusShift` (a shared helper).
- **Controls**: appear at the left and right edges of the viewport. On desktop
  they are hidden by default and revealed on hover or focus
  (`:has([data-carousel-viewport]:hover)`, `:has(*:focus-visible)`). On touch
  they are visible by default. `canMovePrev` / `canMoveNext` reflect the
  finite boundary state.
- **Diagnostic**: an optional slot. When attached, it reads the carousel's
  raw inputs and hand-written constants and emits dev-only warnings. It
  never normalises, validates, repairs, or substitutes any runtime value;
  the carousel uses identical runtime values with or without it. With the
  slot attached, DEV consoles surface `[Carousel Diagnostic][CRITICAL|LOGICAL]`
  lines describing each invariant violation and its consequence.

### 2.3 What is *not* part of the product contract

These are old implementation details that the new design does not preserve:

- the specific layer ordering inside the orchestrator (configuration → reducer →
  motion controller → projection source → DOM bridge → modules);
- the `CarouselMotionProjectionSource` priority-queue API with deferred-frame
  publishing for idle samples;
- the `motion-plan / motion-execution / motion-projection / motion-duration /
  motion-speed / motion-profile` separation into six sibling folders;
- the reducer-transition folder mirror (drag-transition, repeated-click-transition,
  step-transition, layout-reconciliation) — these are joined or restructured;
- the specific shape of `CarouselModuleContextValue` (the new module API is
  smaller and clearly partitioned into status, navigation, projection);
- two separate render modes inside `PaginationWidget` with two parallel ref
  arrays and two write caches;
- the `useCarouselEngine` indirection layer that re-wraps every dispatch with
  layout/instant/epsilon context.

---

## 3. Ownership model

Every responsibility has exactly one owner. The orchestrator wires them.

| Concern | Owner | Notes |
| --- | --- | --- |
| Public props | `Carousel.tsx` | Frozen contract, declared in `types.ts`. |
| Resolved runtime config | `useCarouselConfig` | One memo. Substitutes defaults only for `undefined` props; never normalises explicit values. |
| Slide records | `useCarouselSlideDeck` | Builds the slide records, optionally extends. |
| Layout facts | `useCarouselSlideDeck` | `length`, `visibleSlidesCount`, `pageCount`, `virtualLength`, `canSlide`, `isFinite`, `dataKey`. |
| Logical state | `useCarouselState` | Reducer-backed. Owns `activePageIndex`, `targetPageIndex`, `fromVirtualIndex`, `virtualIndex`, `motionPhase`, `chain`, `gestureRelease`, `intent`. |
| Visual sampled position | `useVisualPosition` | Wraps a single `MotionController`. Sole SSOT for the visible track offset. |
| Motion execution | `useMotionRunner` | Reads logical state, builds a segment, calls into the controller. |
| Track DOM | `useTrackBinding` | Measures slot size and subscribes to visual position; writes `transform`. |
| Render window | `useCarouselSlideDeck` | Memoised; expands during motion, snaps on idle. |
| Gesture lifecycle | `useCarouselGesture` | Wraps the shared `usePointerSwipe`. Converts pointer events into dispatches and direct position writes. |
| Autoplay lifecycle | `useAutoplay` | Owns the interval timer, hover/visibility/dragging pause. |
| Focus shift | `useFocusRecovery` | Triggers when the state settles. |
| Module API | `useModuleContextValue` | Builds the value once, memoised. |
| Module render policy | `useModuleRenderPolicy` | Decides whether controls / pagination render. |
| Diagnostic warnings | `Diagnostic` module | Observe-only DEV warnings; never owns or replaces runtime values. |

Each hook returns exactly the shape it owns. No hook reads another hook's
internal state. Cross-layer values flow only through hook arguments and the
context provider.

---

## 4. Single source of truth (SSOT)

The system has four SSOTs, each owned by exactly one layer:

1. **Logical state** — `useCarouselState`. Holds `activePageIndex`,
   `targetPageIndex`, `fromVirtualIndex`, `virtualIndex`, `motionPhase`,
   `chain` (the optional follow-up virtual index for repeated-click), and
   `gestureRelease` (the velocity payload of the latest END_DRAG). No timing.
2. **Visual sampled position** — `useVisualPosition`. The controller's
   `value`/`velocity`/`target` are the only authority on "where the track is
   right now". Everything that needs a per-frame number subscribes to this
   layer. The track DOM and the PaginationWidget binding are its consumers.
3. **Layout facts** — `useCarouselSlideDeck` returns a memoised `layout`
   object. Derived from props; recomputed only when the inputs change.
4. **Runtime config** — `useCarouselConfig`. Substitutes defaults only for
   `undefined` props. Never coerces, clamps, or repairs explicit values; the
   diagnostic layer surfaces those issues without modifying the resolved
   config.

No layer mirrors another layer's value. The state machine never reads a
sampled motion value; instead the gesture controller reads the visual
position and passes it into the dispatch as a value. The visual position
never reads the logical state; the runner is the only bridge.

---

## 5. Motion model

There is exactly one `MotionController` (a numeric scalar that produces
RAF-driven samples). It samples its current segment and publishes
`{ progress, value, velocity, target, strategy, timestamp, phase }`.

`useVisualPosition` wraps it and provides:

- `subscribe(listener)` — called per frame while a segment is active;
- `getSnapshot()` — pull the current sample (used by gesture origin and the
  controls for cold reads);
- `applyImmediate(position)` — set the value during drag (no animation);
- `snapTo(position)` — finalise without animation.

A `Segment` is one of:

- **Bezier segment** — a cubic-bezier eased move with a known duration; used
  for autoplay/jump/click/snap-back/gesture-easing intents.
- **Profile segment** — a smoothstep-driven acceleration / cruise /
  deceleration profile; used for repeated-click bursts, gesture inertial
  release, and click handoffs (when the current velocity is non-zero in the
  same direction as the new target).

`useMotionRunner` is the only place the controller is started. It runs on
state changes: when `motionPhase` becomes a non-idle value, it picks a fresh
sample as the segment origin (using the controller's own snapshot if a
segment was already running — that is the gesture/click handoff entry
point), builds the segment, and starts the controller. When the controller
completes, the runner dispatches `MOTION_SETTLED`, which advances the state
machine into either the chain follow-up or the idle state.

There is no projection-source layer between the controller and its
consumers. The track binding subscribes to the visual position directly.
The PaginationWidget binding subscribes at the same level. The two
subscriptions are independent listeners on the same RAF tick — there is no
priority queue; both run in the same frame. If a future module ever needs
to read the sample after the track has written, it can use the visual
position's `getSnapshot()` from within its own listener.

---

## 6. Gesture model

The shared `usePointerSwipe` hook is a generic horizontal pointer-swipe
primitive (touch-only, configurable, EMA-smoothed velocity with edge
resistance). It is not carousel-specific and is intended to be reusable by
future components.

`useCarouselGesture` is the carousel-specific adapter on top. It:

1. records the visually-sampled origin position and the slot size at
   press-start, via the visual position;
2. on every move payload, translates `uiOffset` into a virtual index using
   the recorded slot size and writes that directly into the visual position
   (no React state per move);
3. on release, computes the swipe target via `resolveDragRelease` (a pure
   helper in `domain/dragRelease.ts`) and dispatches `END_DRAG` with the
   resolved target plus the pointer/UI velocities.

The dispatch carries the velocities into the state machine, where they are
preserved on the snapshot and read by `useMotionRunner` when it builds the
release segment.

---

## 7. Module synchronisation

Modules attach via the `slot` static convention (resolved by `useCarouselSlots`,
which is built on the shared `resolveSlots`). The `CarouselModuleContext`
value exposes:

- `status: { isMoving, isJumping, isIdle, motionPhase }`,
- `layout: { pageCount, canSlide, isAtStart, isAtEnd, isTouch, isReducedMotion }`,
- `intent: { activePageIndex, targetPageIndex, moveReason, motionDuration }`,
- `navigation: { handlePrev, handleNext, handlePageSelect }`,
- `autoplayPaginationFactor`,
- `visualPosition: VisualPositionSource | null` — `null` only when reduced motion
  is active and live binding makes no sense.

The context is rebuilt only on input changes (memoised). Modules that need
live frame updates do not depend on context for the frame value; they
subscribe to `visualPosition` themselves and mutate their own DOM. Modules
that only need the logical view (the pagination dots, controls availability)
read from the context and re-render at the React tempo.

The `Diagnostic` slot is observe-only. When attached, its presence is
surfaced as `layout.isDiagnosticActive` on the module context so modules
with their own diagnostic checks (e.g. `PaginationWidget` via
`useWidgetDiagnostic`) can run only when diagnostics are wired up. The
slot itself reads `CarouselDiagnosticContext` (raw props + layout snapshot
+ slot attachment state) and runs the checks under
`modules/Diagnostic/checks/`. Diagnostic never owns, normalises, replaces,
or repairs any runtime value — the carousel uses identical runtime values
regardless of whether the slot is attached.

---

## 8. Folder graph

```
src/components/Carousel/
├── ARCHITECTURE.md
├── Carousel.tsx               composition root, no business logic
├── Carousel.module.scss
├── index.ts                   public re-exports
├── types.ts                   public CarouselProps, Slide, ClassNameMap
├── config/                    config resolution
│   ├── defaults.ts
│   ├── constants.ts           tunable runtime constants (timings, factors)
│   ├── motion.ts              bezier strings, repeated-click factors
│   ├── gesture.ts             drag config + release motion config
│   ├── interaction.ts         hover/visibility/autoplay-pagination factor
│   └── useCarouselConfig.ts
├── context/
│   ├── CarouselModuleContext.ts
│   ├── CarouselDiagnosticContext.ts
│   └── index.ts
├── domain/                    pure functions, no React
│   ├── index.ts
│   ├── math.ts                clamp, mod, normalizePageIndex, getShortestCyclicDistance
│   ├── slides.ts              record building, partial-page detection, extension
│   ├── layout.ts              CarouselLayout factory, page/virtual conversions
│   ├── renderWindow.ts        windowing math
│   ├── visibility.ts          slide active/actual decision
│   ├── a11y.ts                ARIA props builder
│   ├── track.ts               transform string builders
│   └── dragRelease.ts         release-target resolver
├── state/
│   ├── types.ts               State, Command, MotionPhase, MoveReason
│   ├── initial.ts             initial state factory
│   ├── reconcile.ts           layout reconciliation
│   ├── transitions.ts         pure step / repeated-click / drag transitions
│   ├── reducer.ts             single switch over Commands
│   ├── useCarouselState.ts    binds the reducer to React
│   └── index.ts
├── motion/
│   ├── types.ts               Segment, MotionIntent
│   ├── bezier.ts              cubic-bezier sampler + cache + carousel curves
│   ├── profile.ts             smoothstep profile (accel/cruise/decel)
│   ├── release.ts             inertial release plan helper
│   ├── segmentFactory.ts      builds the Segment for the next motion step
│   ├── duration.ts            duration math per intent
│   ├── useMotionRunner.ts     state → segment → controller
│   └── index.ts
├── position/
│   ├── types.ts
│   ├── createMotionController.ts   shared primitive — moved into shared/ for reuse
│   ├── useVisualPosition.ts        VisualPositionSource owner
│   └── index.ts
├── geometry/
│   ├── useTrackBinding.ts     ResizeObserver + slot measure + transform writer
│   └── index.ts
├── gesture/
│   ├── useCarouselGesture.ts  pointer-swipe → dispatch + visual position writes
│   └── index.ts
├── autoplay/
│   └── useAutoplay.ts
├── focus/
│   └── useFocusRecovery.ts
├── slides/
│   ├── SlideItem.tsx
│   ├── SlideItem.module.scss  (only if slide owns local styles; here it shares
│                                the deck SCSS)
│   ├── types.ts
│   └── useSlideRenderModel.ts virtual slides + render window owner
├── slots/
│   ├── slotNames.ts
│   ├── useCarouselSlots.ts
│   └── index.ts
├── render-policy/
│   └── useModuleRenderPolicy.ts
└── modules/
    ├── Controls/...
    ├── Pagination/...
    ├── PaginationWidget/...
    └── Diagnostic/
        ├── Diagnostic.tsx        observe-only orchestrator
        ├── formatter.ts          unified warning line builder
        ├── types.ts              Severity + Warning shape
        ├── useGroupedWarnings.ts dev console emitter with dedupe
        ├── useWidgetDiagnostic.ts  hook for PaginationWidget checks
        └── checks/
            ├── propChecks.ts     public input checks
            ├── constantChecks.ts hand-written constant checks
            ├── layoutChecks.ts   page layout + slot attachment
            └── widgetChecks.ts   PaginationWidget prop checks
```

This graph is intentionally different from the previous one. The old
`core/model/{motion-plan,motion-execution,motion-projection,motion-duration,
motion-speed,motion-profile}` cluster is replaced by a single `motion/`
folder. The old `core/hooks/{control,modules,motion,setup}` cluster is
replaced by domain-named folders (`state`, `position`, `geometry`, `gesture`,
`autoplay`, `slides`, `slots`, `render-policy`). The old `core/components`
folder becomes the `slides/` folder, since the slide is the only component
the deck renders directly. Modules are siblings of the deck, not under
`core/`, because the deck is *the* component and modules attach to it.

---

## 9. Why the new structure is not a copy of the old

The mapping below makes the differences explicit.

| Old | New | Difference |
| --- | --- | --- |
| `core/Carousel.tsx` (18 hooks, inline logic) | `Carousel.tsx` (composition root, no business logic) | New file written from scratch around the new ownership model; no piece of inline math, motion wiring, or context construction was copied. |
| `core/model/reducer/{reducer, state, transitions/*}` | `state/{reducer, transitions, reconcile, initial}` | Same reducer pattern; rewritten with a smaller command set (`MOTION_SETTLED` replaces `END_STEP`, drag and step transitions consolidated). |
| `core/model/motion-plan` | folded into `motion/segmentFactory.ts` + `motion/duration.ts` | Motion intent + plan + duration now live next to the segment factory that consumes them. The state machine no longer owns plan resolution. |
| `core/model/motion-projection` | removed | No priority queue, no deferred-frame layer. Track and module bindings subscribe to `useVisualPosition` directly. |
| `core/hooks/control/useCarouselTrackPositionBridge` | `geometry/useTrackBinding` + `position/useVisualPosition` | The bridge had two roles (DOM writer + "current position" reader). They are separated: visual position owns the read API, track binding only writes. |
| `core/hooks/control/useCarouselEngine` | removed | No more dispatch-wrapper layer. The state hook returns a typed `dispatch` directly; layout / instant / drag-epsilon context is folded into the reducer signature. |
| `core/hooks/control/useCarouselGesture` + `useCarouselDragController` | `gesture/useCarouselGesture` | The two old hooks collapse into one (the gesture is the controller — there is no separate "gesture phase" vs "drag controller" distinction). |
| `core/hooks/control/useCarouselNavigationController` + `useCarouselClickHandlers` | `state/useCarouselNavigation` (inside `useCarouselState`) | Click handlers become trivial wrappers built once from the dispatch and exposed via the module context. |
| `core/hooks/modules/useCarouselModuleContextValue` | `context/useModuleContextValue` | Same idea; shape redefined to split status / layout / intent / navigation / projection cleanly. |
| `core/utilities/{drag-release, layout, math, slide-records, slide-rendering, slide-styles, track-geometry, track-styles, visible-slides}` | `domain/{math, slides, layout, renderWindow, visibility, a11y, track, dragRelease}` | Same domain, cleaner partition: layout and page math separated from render-window math, slide styles inlined into the slides folder. |
| `shared/motion/{motionEngine, createMappedNumericMotionValueSource, ...}` | `shared/motion/createMotionController.ts` + `position/useVisualPosition.ts` | The shared layer keeps the generic numeric motion controller. The carousel-specific projection wrapper now lives next to the carousel. |
| `shared/touch-input/drag-engine/useDragEngine` | `shared/gesture/usePointerSwipe` | Same idea, smaller surface, renamed to reflect that it is pointer-driven swipe (not arbitrary drag). The interactive-target detection is preserved as a pure helper, the resistance / EMA / release intent helpers are reused. |
| `shared/touch-input/velocity-engine/*` | `shared/gesture/inertialRelease.ts` (only the public helper) | The "velocity-engine" name is replaced by a clearer "inertial release" helper that takes a release velocity and produces a release plan. |

---

## 10. Old code: what is reused, what is rewritten, what is rejected

### Copied as a generic primitive

- `clamp`, `mod`, `normalizePageIndex`, `getShortestCyclicDistance` — pure math.
- `cubicBezierValue`, `cubicBezierDerivative`, the bisection solver for `t` —
  pure math, well-tested by inspection.
- The smoothstep / smoothstepIntegral pair used inside the profile solver.
- `INTERACTIVE_TARGET_SELECTOR` — DOM selector list for interactive descendants
  of slides (so a button inside a slide content keeps its click on touch).
- `manageFocusShift` — a generic helper, lives in `shared/focus/`.
- `useIsTouchDevice`, `useIsReducedMotion`, `useMatchMedia`,
  `useIsomorphicLayoutEffect` — generic hooks.
- The cubic-bezier strings (`MOVE_BEZIER`, `JUMP_BEZIER`, `SNAP_BACK_BEZIER`,
  `AUTO_BEZIER`) — these are the *visual contract* (the easing the user sees),
  so they are preserved verbatim.
- The numeric constants that express product intent: `REPEATED_CLICK_SPEED_MULTIPLIER`,
  `REPEATED_CLICK_DESTINATION_POSITION` (and its touch variant),
  acceleration / deceleration distance shares, `HOVER_PAUSE_DELAY`,
  `VISIBILITY_THRESHOLD`, `AUTOPLAY_PAGINATION_FACTOR`, `SNAP_BACK_DURATION`,
  the drag engine config (`INTENT_THRESHOLD`, `RESISTANCE`, `EMA_ALPHA`, etc.).
  These define how the component *feels*. Changing them would change the product.

### Adapted into the new architecture

- The state-machine actions (MOVE / GO_TO / drag / settle) — same intent,
  redefined with smaller TypeScript surface and a single `Command` discriminated
  union. No reducer transition file is copied; transitions are rewritten to
  match the new state shape.
- The render-window expander (`containsRenderWindow`, `expandRenderWindow`,
  `getRenderMovementSegment`) — adapted into the `domain/renderWindow.ts`
  module. Same algorithm, simpler call sites.
- The motion profile solver (smoothstep accel/cruise/decel) — adapted into
  `motion/profile.ts`. The peak-speed-for-duration bisection is kept; the
  zone iteration is the same.
- The PaginationWidget spatial-field math (scales, strip, edge drift) — kept
  inside `modules/PaginationWidget/math/`. The widget itself is rewritten as
  a single-mode binding (no dual static / motion-bound rendering).

### Rewritten from the old idea

- The orchestrator (`Carousel.tsx`) — written from scratch around the new
  layers.
- The state hook (`useCarouselState`) — written from scratch; the reducer
  signature, transitions, and reconciliation are new. No file was copied
  forward.
- The motion runner (`useMotionRunner`) — written from scratch. The old
  `useCarouselMotion` hook is not used as a template; its handoff snapshot
  pattern is rewritten directly inside the runner using the controller's
  own `isActive() + read()` reads.
- The track DOM bridge — rewritten as `useTrackBinding`. ResizeObserver and
  slot measurement are the same idea; the integration with visual position
  and the way layout writes happen is new.
- The gesture adapter — rewritten as one hook on top of the shared swipe
  primitive. The old two-hook split (gesture + drag controller) is gone.
- The module context value — redefined. The new shape is partitioned into
  status / layout / intent / navigation / visualPosition rather than a flat
  bag of fields.
- The PaginationWidget binding — rewritten with a single ref array and a
  single write path. The old dual-mode logic with two ref arrays and two
  write caches is removed.

### Rejected

- `motion-projection-source` with priorities and deferred frame publishing —
  the priority abstraction was never genuinely required; deferred-frame
  publishing was an artefact of the projection layer's own architecture.
- The `useCarouselEngine` indirection — every dispatch now flows directly
  through the typed reducer; layout context is part of the reducer signature.
- The `useResponsiveRepeatedClickSettings` separate hook — merged into the
  config resolution as a single touch-aware destination-position value.
- The `motion-plan` / `motion-execution` six-folder split — merged into a
  cohesive `motion/` folder.
- The `useCarouselSlots` separate hook returning `{ slots }` (over-wrapped
  shared `resolveSlots`) — folded into the orchestrator inline since it is a
  one-liner.

---

## 11. Trade-offs

- **Per-frame mutation in track binding and PaginationWidget**: deliberately
  bypasses React rendering. The trade-off is that DOM manipulation lives
  outside React's reconciler, but the alternative (state per frame, context
  per frame) would re-render every consumer at 60 Hz for purely visual data.
  The pattern is contained — both hooks own their own DOM refs and subscribe
  through the same single API.
- **Visual position is global per-instance, not via context**: every consumer
  takes it as an explicit dependency through props (Carousel internals) or
  through the module context value (modules). This makes the data flow
  visible in source rather than relying on hidden context provider scope.
- **State machine reads `fromVirtualIndex` from the gesture/click site, not
  internally**: callers pass the visually-sampled origin as part of the
  dispatch payload. The state machine never reaches into the motion
  controller. This keeps the state machine pure (testable without any DOM /
  RAF context).
- **Render-window keeps its expanded shape during a motion segment**: the
  window only shrinks back when motion settles. This avoids unmounting a
  slide mid-flight if the window edges shift; it costs at most one extra
  rendered slide pair during fast direction switches.
- **Diagnostic is strictly observe-only**: the runtime values the carousel
  uses do not depend on whether the Diagnostic slot is attached. Diagnostic
  never normalises, validates, repairs, or substitutes any value; it reads
  and warns. The trade-off is that the carousel will visibly misbehave when
  fed invalid inputs (NaN propagation, impossible geometry, malformed
  transforms) — which is the intended signal that the input must be fixed.

---

## 12. Quality protections

- **TypeScript**: discriminated unions for `Command`, `MotionPhase`, `MoveReason`,
  `Segment`, `MotionIntent`. No `any`.
- **React safety**: per-frame work never touches React state. State machine
  dispatches are batched by React. Effects are pure; cleanup is explicit.
  `useIsomorphicLayoutEffect` is used only for DOM measurement and
  subscription wiring.
- **Strict Mode**: the motion controller cleanups handle remount; the
  visual position subscription returns a cleanup that disconnects from the
  controller.
- **Runtime safety**: layout reconciliation tolerates page count changes
  and resets on dataKey changes. Numeric inputs are *not* coerced or
  repaired — invalid input is intentionally allowed to propagate so the
  failure mode is visible. The diagnostic layer surfaces the violation
  separately, without ever feeding back into runtime.
- **Performance**: bezier and profile samplers cache their work where the
  inputs are known (parsed beziers, computed strips). The track binding
  short-circuits writes that would re-apply the same transform. The
  PaginationWidget binding short-circuits writes per dot.

---

## 13. Reading guide

The intended reading order for someone new to the component is:

1. `types.ts` — public surface;
2. `Carousel.tsx` — top-down composition;
3. `state/types.ts` and `state/reducer.ts` — what the carousel knows about itself;
4. `motion/types.ts` and `motion/segmentFactory.ts` — how a logical step becomes a visual segment;
5. `position/useVisualPosition.ts` — how the visible position is sampled and exposed;
6. `geometry/useTrackBinding.ts` — how the track DOM is written;
7. `gesture/useCarouselGesture.ts` — how a touch swipe ends up as a dispatch;
8. the modules.

If a future reader can follow that order without needing to bounce between
files for inverse dependencies, the architecture has held.
