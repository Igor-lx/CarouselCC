# Carousel

A React 19 carousel deck with motion-controller-driven track movement, touch
gesture, fast repeated-click acceleration, autoplay, dot pagination, an alternative
touch pagination widget, edge controls, and a dev-only diagnostic slot.

The component is a single composition root (`Carousel.tsx`) plus four pluggable
slot modules. The track owns a horizontal `transform` that is mutated outside
React at RAF tempo by a single visual-position SSOT; React only re-renders on
logical state transitions (click, gesture release, autoplay tick, settle).

This document is the source of truth for the component. It starts from the
public contract — every prop, every dependency between props, every default —
and then describes the internal architecture.

---

## 1. Product contract

### 1.1 Import

```tsx
import Carousel, { type Slide, type CarouselProps } from "@/components/Carousel";
import { Pagination } from "@/components/Carousel/modules/Pagination";
import { PaginationWidget } from "@/components/Carousel/modules/PaginationWidget";
import { Controls } from "@/components/Carousel/modules/Controls";
import { Diagnostic } from "@/components/Carousel/modules/Diagnostic";
```

The default export is the deck. Modules are named exports from their own
folders and attach via the `slot` static convention (see §3).

### 1.2 Minimal usage

```tsx
<Carousel slidesData={slides}>
  <Pagination />
  <Controls />
</Carousel>
```

With overrides and an injected environment:

```tsx
const userEnvironment = useUserEnvironment(); // from "@/shared"

<Carousel
  slidesData={slides}
  visibleSlidesNr={3}
  isAuto
  isPagePaddingOn
  durationStep={2000}
  jumpSpeedMultiplier={8}
  intervalAutoplay={3000}
  userEnvironment={userEnvironment}
  onSlideClick={(slide) => openInNewTab(String(slide.content))}
  onCarouselStatusChange={({ currentPageIndex, pageCount }) =>
    setLabel(`${currentPageIndex + 1} / ${pageCount}`)
  }
>
  {userEnvironment.touch ? <PaginationWidget /> : <Pagination />}
  <Controls />
  <Diagnostic />
</Carousel>
```

### 1.3 Public props

All props are optional except `slidesData`. Defaults below are substituted only
for `undefined` props. Other values pass through unchanged — invalid input
(NaN, negative durations, mismatched slot counts) is surfaced by the
`Diagnostic` slot but never repaired at config resolution time, so the failure
mode is visible. Motion-profile share over-allocation is the one explicit
runtime exception: profile math normalizes acceleration/deceleration zones to
`0.5 / 0.5`, and Diagnostic reports that normalized shape.

#### Slides

| Prop          | Type            | Default | Effect |
| ------------- | --------------- | ------- | ------ |
| `slidesData`  | `Slide[]`       | —       | Required. `Slide = { id: string \| number; content: string \| number \| ReactElement; alt?: string }`. `content` must be a trimmed-non-empty string, a number, or a React element. |
| `visibleSlidesNr` | `number`     | `3`     | How many slides share the viewport. Drives layout flex-basis, slot-size measurement, page math (`pageCount = ceil(slidesData.length / visibleSlidesNr)`), and the PaginationWidget projection slot count. |
| `isPagePaddingOn` | `boolean`    | `false` | When on, pads the deck with cloned tail slides so `length` becomes a multiple of `visibleSlidesNr`. Eliminates partial pages at the tail. |
| `isContentImg` | `boolean`      | `true`  | When on, treats string `content` as an `<img src>`. When off, renders raw `content`. Image errors fall back to `slide.alt` or `errAltPlaceholder`. |
| `errAltPlaceholder` | `string`  | `"Downloading Error"` | Used when an image fails to load and the slide has no `alt`. |

#### Layout / motion mode

| Prop            | Type      | Default | Effect |
| --------------- | --------- | ------- | ------ |
| `isFinite`      | `boolean` | `false` | When on, the track stops at the boundaries (no wrap, `isAtStart`/`isAtEnd` flag the edges). When off, the track loops cyclically and `GO_TO` always travels the shortest cyclic distance. |

#### User environment

The carousel does **not** detect the device/OS environment itself — it is a
pure function of its props. The host injects the environment via a single
optional object prop. The recommended source is the `useUserEnvironment` hook
in `shared`, which composes the individual detection hooks and returns a
referentially-stable object.

| Prop              | Type             | Effect |
| ----------------- | ---------------- | ------ |
| `userEnvironment` | `{ reducedMotion?: boolean; touch?: boolean; dataSaver?: boolean }` | All fields optional. `reducedMotion`: every transition snaps instantly, gesture is disabled, the PaginationWidget runs static. `touch`: gesture eligibility, `data-touch` attribute, autoplay hover-pause exemption. `dataSaver`: speculative image warm-up is skipped. An unset field resolves to `false`; the omission is reported by the `Diagnostic` slot (DEV-only) — never silently repaired. |

#### Motion timing

| Prop              | Default | Effect |
| ----------------- | ------- | ------ |
| `durationAutoplay` | `3000` ms | Duration of an autoplay-driven page step. |
| `intervalAutoplay` | `3000` ms | Idle interval between two autoplay steps. |
| `durationStep`    | `2000` ms | Base duration of duration-authored click / gesture-driven steps. Repeated-click profile segments instead derive their duration from their speed profile. Multi-page click distances scale linearly. |
| `jumpSpeedMultiplier` | `8` | `GO_TO` peak cruise speed as a multiple of the normal one-step speed. A jump's duration is derived from distance and this multiplier, so a near and a far jump share one consistent speed. Drives short jumps and the bounded segments of a far-jump teleport alike. |

#### Module gates

| Prop             | Default | Effect |
| ---------------- | ------- | ------ |
| `isAuto`         | `true`  | Master autoplay switch. When `false`, the `setTimeout` loop never runs. Autoplay also auto-pauses when (a) the viewport is <`VISIBILITY_THRESHOLD` (20 %) on screen, (b) the user is dragging or motion is in progress, (c) on desktop only, the pointer hovers the viewport (`HOVER_PAUSE_DELAY` 150 ms debounce). On the final page in finite mode it loops back to page 0 via `GO_TO`. |
| `isPaginationOn` | `true`  | Gates the rendering of the attached `Pagination`/`PaginationWidget` slot. If the prop is `true` but no pagination slot is attached, nothing renders; the slot must opt in by being placed in `children`. |
| `isControlsOn`   | `true`  | Same contract as `isPaginationOn`, for the `Controls` slot. |
| `isInteractive`  | `true`  | When on, a slide whose image has loaded successfully and that has an `onSlideClick` handler renders as a `<button>`. When off, slides are never interactive even with a handler. |

#### Callbacks

| Prop                       | Type | Effect |
| -------------------------- | ---- | ------ |
| `onSlideClick`             | `(slide: Slide) => void` | Fires when an interactive slide is clicked. The slide is interactive only when `isInteractive`, the image (if any) loaded successfully, and this handler is provided. |
| `onCarouselStatusChange`   | `(snapshot: CarouselStatusSnapshot) => void` | Low-frequency, **observation-only** status. `CarouselStatusSnapshot = { isIdle, currentPageIndex, pageCount, isAtStart, isAtEnd }` — two numbers (which page, of how many), the idle flag, and finite-mode boundary flags (always `false` in cyclic mode). Fires on mount and whenever one of those changes; `currentPageIndex` is the *target* page, so it reflects intent immediately on click/gesture. External ref-buttons can wire `isAtStart` / `isAtEnd` to `disabled` without duplicating layout logic. Carries no per-frame data (position, velocity) and no reducer internals. Deduplicated by a shallow snapshot compare. |

#### Imperative handle

| Prop  | Type | Effect |
| ----- | ---- | ------ |
| `ref` | `Ref<CarouselHandle>` | `CarouselHandle = { prev(): void; next(): void }`. Single-step navigation for external buttons elsewhere on the page or programmatic control. Routes through the same navigation pipeline as `<Controls>` (no second control path) and is a safe no-op when the deck cannot slide. Page jumps (`GO_TO`) are deliberately not exposed — they stay internal, reached through the pagination slot. |

#### Styling

| Prop        | Type           | Effect |
| ----------- | -------------- | ------ |
| `className` | `ClassNameMap` | Partial map keyed by `outerContainer`, `innerContainer`, `slideContainer`, `slide`, `slideInteractive`, `slideError`, `slideText`. Merged into the deck SCSS via `mergeStyleMaps`. Keys not provided fall back to the built-in styles. |

### 1.4 Slot children

`children` accepts module elements identified by a `slot` static:

| Slot          | Component                       | Notes |
| ------------- | ------------------------------- | ----- |
| `pagination`  | `<Pagination />` or `<PaginationWidget />` | Exactly one may be attached. Renders only when `isPaginationOn` is `true`. |
| `controls`    | `<Controls />`                  | Renders only when `isControlsOn` is `true`. |
| `diagnostic`  | `<Diagnostic />`                | Always renders if attached. Dev-only; in prod console output is suppressed by the env guard. |

Slot resolution is done by the shared `resolveSlots` against `CAROUSEL_SLOTS`.
Children that are not slot-tagged are dropped (with a dev warning if a
Diagnostic slot is present).

### 1.5 DOM contract

The deck renders this skeleton (class names are SCSS-module hashed):

```html
<div role="region" aria-roledescription="carousel"
     data-carousel-root data-touch data-reduced-motion>
  <div data-carousel-viewport tabindex="-1">
    <div data-carousel-track>
      <!-- one element per virtual slide in the render window -->
    </div>
    <!-- controls slot (if mounted) -->
  </div>
  <!-- pagination slot (if mounted) -->
  <!-- diagnostic slot (if mounted) -->
</div>
```

Stable hooks for external code:
- `[data-carousel-root]` — the outermost region.
- `[data-carousel-viewport]` — the clipping container.
- `[data-carousel-track]` — the element whose `transform` is animated.
- `data-touch="true|false"` — mirrors `userEnvironment.touch`.
- `data-reduced-motion="true|false"` — mirrors `userEnvironment.reducedMotion`.
- `[inert]` on slides outside the active visual band.

### 1.6 Functional semantics

These are the user-facing behaviours the implementation guarantees.

- **Slide layout.** `pageCount = ceil(length / visibleSlidesCount)`. When
  `length ≤ visibleSlidesCount`, `layout.canSlide` is false and the deck shows
  statically (no gesture, no click navigation, no autoplay). When
  `!isFinite && canSlide`, the track behaves cyclically.
- **Step semantics.** `MOVE(+1)` advances one page, `MOVE(-1)` retreats one
  page, `GO_TO(pageIndex)` jumps over a possibly larger distance. In cyclic
  mode, `GO_TO` always travels the shortest cyclic distance.
- **GO_TO motion.** Every `GO_TO` follows a speed-authored profile:
  accelerate, cruise, decelerate. Acceleration is measured inside the first
  page screen; deceleration is measured inside the final page screen. A jump
  that fits the visible preflight + approach budget animates its whole
  distance. A far jump animates
  `GO_TO_PREFLIGHT_PAGE_SPAN` page screens, teleports the un-rendered middle,
  then animates the final approach page. See §4.4.
- **Click during motion (opposite direction).** Re-targets without
  restarting from the logical origin: the new segment continues from the
  last emitted visual sample, not from where the previous segment was
  supposed to start.
- **Repeated click (same direction during motion).** Does not restart from
  scratch and does not accumulate an unbounded command queue. The reducer
  anchors the cursor on the live visual page
  (`floor(fromVirtualIndex / stepSize)` for forward motion,
  `ceil(fromVirtualIndex / stepSize)` for reverse motion), then resolves the
  target two pages ahead in that direction. While the visual sample stays
  inside the same page, more clicks refresh the live origin and fast profile
  without extending the target; after the visual crosses a page boundary, the
  next rapid click advances the target one more page. The fast segment's peak
  speed is `REPEATED_CLICK_SPEED_MULTIPLIER` of a normal MOVE.
- **Drag / swipe.** Touch only (pointer events with `pointerType === "touch"`).
  EMA-smoothed velocity, edge resistance with a configurable curvature.
  Release resolves to a swipe direction via either a quick-flick (raw
  velocity + raw offset) or a distance-based threshold
  (`swipeThresholdRatio` of the viewport width with a hard min). When the
  intent is `NONE`, the track snaps back via the snap-back curve over
  `SNAP_BACK_DURATION` (1300 ms).
- **Gesture interrupts motion.** A touch on the non-interactive carousel
  surface cancels active motion at press-down and starts from the visually
  sampled position. A touch on an interactive child (button/link-like slide)
  waits until horizontal swipe intent is recognised, so ordinary taps remain
  clickable. The cancel is published
  through the visual-position SSOT, so the pagination widget, the track,
  and the motion runner all observe one consistent state during the
  gesture.
- **Autoplay.** A `setTimeout(intervalAutoplay)` schedules the next step
  whenever the carousel is in the eligible state described under
  `isAuto`. On the final page in finite mode, the next step loops back to
  page 0 via `GO_TO`.
- **External status signal.** `onCarouselStatusChange` fires on mount and on
  every change of `{ isIdle, currentPageIndex, pageCount, isAtStart, isAtEnd }`
  — a low-frequency, observation-only snapshot. Consumers use it for a
  "page X of Y" label, to schedule non-critical work around motion, and to
  mirror finite-mode boundary state on external prev / next buttons. It
  carries no per-frame data and no reducer internals; the carousel still runs
  its own image preparation for nearby slides while idle, independent of this
  signal.
- **External imperative control.** A `ref` of type `CarouselHandle` exposes
  `prev()` / `next()` for buttons outside the carousel subtree or programmatic
  use. Both route through the same navigation pipeline as `<Controls>`.
- **Image preparation.** When `isContentImg` is on, the slide layer warms
  image URLs around the idle viewport: the visible band plus a page-lookahead
  buffer on each side, nearest-first. The carousel steps a whole page
  (`visibleSlidesCount` slides) at a time, so the buffer is sized in
  page-steps via a lookahead schedule (`config/slides`) that shrinks as the
  visible band widens, keeping the absolute warmed buffer bounded. Each idle
  period is one preparation session; entering motion closes that session in
  the layout phase before paint — aborting in-flight offscreen warm-up
  fetches and cancelling queued decode work. Warm-up fetches are low priority
  and decode only inside an active idle session. A successful warm-up lands
  in the image-resource SSOT, so a slide entering the render window can
  observe an already-`loaded` resource; a speculative warm-up failure does
  not become a visible slide error. Heavyweight offscreen warm-up `Image`
  handles live only while their URL is inside the active preload window —
  once it leaves, the handle is released, so even a 500-slide deck never
  turns the store into a hidden full-deck image cache. It never changes
  navigation, layout, motion state, or slide rendering semantics.

  Warm-up is purely speculative, so it is skipped — on every device — when
  the host reports reduced data usage via `userEnvironment.dataSaver` (the
  host derives it from `prefers-reduced-data` / the Network Information API
  `saveData` flag, e.g. through `useUserEnvironment`). The image-resource
  store, its render SSOT, and image error handling / retry are unaffected:
  those are correctness, not optimization, and always run.
- **Image errors and retry.** A slide whose image fails to load renders a
  text placeholder (`alt`, or `errAltPlaceholder`) and is not interactive.
  While such a slide sits in the active band, the image-resource store
  retries the URL on an exponential backoff (capped attempts); a successful
  retry remounts the slide's `<img>` and restores it. Error and retry are a
  single store-owned mechanism — slides hold no private error state.
- **Reduced motion.** When `userEnvironment.reducedMotion` is `true`, every
  transition snaps instantly, the gesture adapter is disabled, and pagination
  dot transitions are killed
  (`[data-reduced-motion="true"] .dot { transition: none }`).
- **Pagination (`Pagination`).** One dot per page. The active dot reflects
  the `targetPageIndex` immediately on click and gesture. During
  *autoplay*, the dot switch is delayed by
  `autoplayMotionDuration * AUTOPLAY_PAGINATION_FACTOR` (default 20 % of the
  animation) — this matches the historical product behaviour where
  autoplay rolls the dot later than the visual.
- **PaginationWidget (touch).** A fixed-width odd-count widget (default
  5 dots, configurable via internal `PAGINATION_WIDGET_DEFAULTS`). Centre
  dot is largest; sides shrink exponentially by `scaleFactor` (0.585).
  When reduced motion is *off*, the widget subscribes to the visual
  position source and mutates its dots' `transform` and `opacity` per RAF
  frame without re-rendering React. Two `activeDot` overlays interpolate
  between adjacent page indexes so the active highlight tracks the visual
  progress, not the logical target.
- **Slide click.** A slide is interactive (rendered as `<button>`) when
  `isInteractive` is true, the image loaded successfully, and an
  `onSlideClick` handler was provided. Otherwise rendered as `<div>`.
  Slides outside the active visual band are `inert`.
- **Focus management.** When the carousel settles after a step, if focus
  is currently inside an out-of-band (now `inert`) slide, focus is moved
  to the first focusable target inside the new active band via
  `manageFocusShift`. No-op when nothing is focused inside the deck.
- **Controls.** `<Controls />` renders one zone on each edge of the
  viewport. On desktop they are hidden by default and revealed by direct
  viewport `:hover` and descendant `:focus-visible` selectors. Mouse focus
  alone does not reveal the zones after hover leaves. On touch they are
  visible by default.
  `canMovePrev` / `canMoveNext` reflect the finite-boundary state, so the
  edge zones are not rendered when there is no destination.
- **Diagnostic.** Observation-only. When attached, raw inputs and
  hand-written constants are checked. Violations surface as DEV-only
  `[Carousel Diagnostic][CRITICAL|LOGICAL]` console lines, deduplicated
  via the formatter. The runtime values the carousel uses are *identical*
  whether the slot is attached or not. The slot's presence is exposed on
  the module context as `layout.isDiagnosticActive` so module-level checks
  (e.g. `PaginationWidget`'s `useWidgetDiagnostic`) skip their work when
  no diagnostic is wired up.

### 1.7 Default values reference

For copy-paste / quick lookup. Source: `config/defaults.ts`,
`config/interaction.ts`, `config/motion.ts`, `config/gesture.ts`,
`config/constants.ts`.

| Constant | Value | Where it shows |
| --- | --- | --- |
| `visibleSlidesNr` (default) | `3` | slot count, flex basis |
| `durationAutoplay` (default) | `3000` ms | autoplay step duration |
| `intervalAutoplay` (default) | `3000` ms | autoplay idle interval |
| `durationStep` (default) | `2000` ms | click/gesture-driven step |
| `jumpSpeedMultiplier` (default) | `8` | `GO_TO` peak speed vs. one-step speed |
| `errAltPlaceholder` (default) | `"Downloading Error"` | image error text |
| `HOVER_PAUSE_DELAY` | `150` ms | hover-pause debounce |
| `VISIBILITY_THRESHOLD` | `0.2` | viewport visibility fraction |
| `AUTOPLAY_PAGINATION_FACTOR` | `0.2` | autoplay dot switch delay |
| `SNAP_BACK_DURATION` | `1300` ms | drag snap-back |
| `REPEATED_CLICK_SPEED_MULTIPLIER` | `5` | fast-segment peak vs. normal |
| `REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE` | `0.35` | profile ramp-up |
| `REPEATED_CLICK_DECELERATION_DISTANCE_SHARE` | `0.35` | profile ramp-down |
| `GO_TO_PREFLIGHT_PAGE_SPAN` | `2` | page screens animated before a far-GO_TO teleport |
| `GO_TO_FINAL_APPROACH_PAGE_SPAN` | `1` | page screens animated after a far-GO_TO teleport |
| `GO_TO_ACCELERATION_DISTANCE_SHARE` | `0.5` | GO_TO ramp-up share of the first page screen |
| `GO_TO_DECELERATION_DISTANCE_SHARE` | `0.5` | GO_TO ramp-down share of the final page screen |
| `MOVE_BEZIER` | `cubic-bezier(0.32, 0.2, 0.28, 1)` | normal step |
| `AUTO_BEZIER` | `cubic-bezier(0.28, 0.72, 0.38, 1)` | autoplay step |
| `SNAP_BACK_BEZIER` | `cubic-bezier(0.18, 0.82, 0.28, 1)` | drag snap-back |
| `CAROUSEL_SWIPE_CONFIG.resistance` | `0.53` | drag edge resistance |
| `CAROUSEL_SWIPE_CONFIG.emaAlpha` | `0.85` | velocity smoothing |
| `CAROUSEL_SWIPE_CONFIG.swipeThresholdRatio` | `0.23` | distance threshold |
| `CAROUSEL_SWIPE_CONFIG.minSwipeDistance` | `20` px | hard min for distance threshold |
| `CAROUSEL_INERTIAL_RELEASE_CONFIG.inertiaBoost` | `2.15` | post-release acceleration |
| `CAROUSEL_INERTIAL_RELEASE_CONFIG.decelerationDistanceShare` | `0.25` | post-release tail share |
| `MOTION_EPSILON` | `0.0001` | sample comparison tolerance |
| `DRAG_RELEASE_EPSILON` | `0.001` | drag "on target" tolerance |
| `RENDER_WINDOW_BUFFER_MULTIPLIER` | `1` | mounted-slide neighbour count |

These are part of the visual contract. Changing them changes how the
component *feels* — they are not safe to tune without a UX review.

---

## 2. Ownership model

Every responsibility has exactly one owner. The orchestrator
(`Carousel.tsx`) wires them.

| Concern | Owner | Notes |
| --- | --- | --- |
| Public props | `Carousel.tsx` | Frozen contract, declared in `contract/`. |
| User environment | host application | Injected via the `userEnvironment` prop. The carousel never detects `prefers-reduced-motion` / touch / data-saver itself; the host reads them (recommended: `useUserEnvironment` in `shared`) and passes a stable object in. |
| Resolved runtime config | `useCarouselConfig` | One memo. Substitutes defaults only for `undefined` props; never normalises explicit values. Motion-profile share normalization happens later inside the profile builder, not in config. |
| Slide records | `useCarouselSlideDeck` | Builds slide records, optionally extends to fill perfect pages. |
| Layout facts | `useCarouselSlideDeck` | `length`, `visibleSlidesCount`, `pageCount`, `virtualLength`, `canSlide`, `isFinite`, `dataKey`. |
| Logical state | `useCarouselState` | Reducer-backed. Owns `targetPageIndex`, `fromVirtualIndex`, `virtualIndex`, optional `teleportVirtualIndex`, `isTeleportApproach`, `motionPhase`, `gesture`, `isRepeatedClickAdvance`, `moveReason`. |
| Visual sampled position | `useVisualPosition` | Wraps a single `MotionController`. Sole SSOT for the visible track offset. |
| Motion execution | `useCarouselMotionExecution` + `useMotionRunner` | Owns motion-duration publication and settle feedback, then reads logical state, builds a segment, and calls into the controller. |
| Track DOM | `useTrackBinding` | Measures slot size and subscribes to visual position; writes `transform`. |
| Render window | `useSlideRenderModel` | Memoised; expands during motion, snaps on idle. |
| Image resources | image-resource store (`createImageResourceStore`) | Per-URL render status, explicit visible-owner count, speculative warm-up lifecycle, retry policy, and a session-scoped decode queue. One instance per carousel; the single authority on image renderability. |
| Image preparation | `useSlideImagePreload` | React adapter that derives the deck + idle-window URL sets and drives the store through one atomic preparation-window API. Holds no image logic of its own. |
| Slide image binding | `useImageResource` | Registers a `SlideItem` as a visible owner of its URL and subscribes to the URL's snapshot via `useSyncExternalStore`. |
| Gesture lifecycle | `useCarouselGesture` | Wraps the shared `usePointerSwipe`. Converts pointer events into dispatches and direct position writes. |
| Autoplay lifecycle | `useAutoplay` | Owns the interval timer, hover/visibility/dragging pause. |
| Focus shift | `useFocusRecovery` | Triggers when the state settles. |
| Module API | `useModuleContextValue` | Builds the value once, memoised. |
| Module render policy | `useModuleRenderPolicy` | Decides controls / pagination / diagnostic rendering and centralizes slot-presence checks. |
| Diagnostic warnings | `Diagnostic` module | Observe-only DEV warnings; never owns or replaces runtime values. |

Each hook returns exactly the shape it owns. No hook reads another hook's
internal state. Cross-layer values flow only through hook arguments and the
context provider.

---

## 3. Single source of truth (SSOT)

The system has five SSOTs, each owned by exactly one layer.

1. **Logical state** — `useCarouselState`. Holds `targetPageIndex`,
   `fromVirtualIndex`, `virtualIndex`, optional `teleportVirtualIndex`,
   `isTeleportApproach`, `motionPhase`,
   `gesture` (the velocity payload of the latest END_DRAG), and
   `isRepeatedClickAdvance`. No timing. Reducer-pure: every transition is
   a pure function of `(state, command, context)`.
2. **Visual sampled position** — `useVisualPosition`. The motion
   controller's `value`/`velocity`/`target` are the only authority on
   "where the track is right now". Everything that needs a per-frame
   number subscribes here. The track DOM and the PaginationWidget binding
   are its consumers.
3. **Layout facts** — `useCarouselSlideDeck` returns a memoised `layout`
   object. Derived from props; recomputed only when the inputs change.
4. **Runtime config** — `useCarouselConfig`. Substitutes defaults only for
   `undefined` props. Never coerces, clamps, or repairs explicit values;
   the diagnostic layer surfaces violations without modifying the
   resolved config.
5. **Image resources** — the image-resource store
   (`createImageResourceStore`, one instance per carousel, created only when
   `isContentImg` is on). Holds one entry per image URL with two separate
   models:
   - render SSOT: `status` (`loading | loaded | error`) plus retry
     `generation`;
   - preparation lifecycle: visible owner count, warm-up status
     (`unattempted | fetching | ready | failed | suspended`), retained
     offscreen element, and decode ownership.

   `useSlideImagePreload` is its only writer of preparation intent; each
   `SlideItem` registers as a visible owner and subscribes to its URL via
   `useImageResource`, then reports the real `<img>` outcome back. Warm-up
   success may publish `loaded` only while no real visible failure exists;
   warm-up failure stays speculative and never publishes `error`. "Has this
   slide's image failed" is a *derived read* of this SSOT, never a second
   copy of state. Observation-only: it never feeds navigation, layout, or
   motion.

No layer mirrors another layer's value. The state machine never reads a
sampled motion value: the gesture controller reads the visual position and
passes it *into* the dispatch payload. The visual position never reads
the logical state; the motion runner is the only bridge.

---

## 4. Motion model

There is exactly one `MotionController` per Carousel instance (a numeric
scalar that produces RAF-driven samples). It samples its current segment
and publishes `{ progress, value, velocity, target, strategy, timestamp,
phase }`.

`useVisualPosition` wraps it and exposes:

- `subscribe(listener)` — per-frame stream while a segment is active.
  Subscribers (track binding, pagination widget binding) mutate their own
  DOM inside the callback; React is not involved at this tempo.
- `getSnapshot()` returns the last emitted visual frame. Cold reads on user
  events (gesture press start, navigation click) use this so the captured
  origin matches what DOM subscribers have already received, not a
  mathematically fresh but unpainted controller sample.
- `applyImmediatePosition(position)` — publish a position into the stream
  during drag. Internally calls `controller.set`, which cancels any
  active motion and emits, so the track, the widget, and the motion
  runner all observe one consistent source of truth throughout the
  gesture.

### 4.1 Segments

A `Segment` is one of:

- **Bezier segment** — a cubic-bezier eased move with a known duration.
  Used for autoplay (`AUTO_BEZIER`), click step / non-inertial gesture
  release (`MOVE_BEZIER`), and snap-back (`SNAP_BACK_BEZIER`).
- **Profile segment** - a smoothstep-driven acceleration / cruise /
  deceleration profile. These segments are speed-authored: start / peak /
  end speeds plus zone distances derive the segment duration. If acceleration
  and deceleration shares sum above `1`, runtime normalizes the profile to
  `0.5 / 0.5` with no cruise zone. Used for:
  - **every GO_TO** - speed-authored profile motion at
    `jumpSpeedMultiplier × normalStepSpeed`. A short jump uses one segment
    with local first-screen acceleration and local final-screen deceleration;
    a far jump uses a preflight segment, a position teleport, and a fixed
    one-page approach (§4.4);
  - **repeated-click fast advance** - one segment directly to the bounded
    visual-lookahead target, peak speed
    `REPEATED_CLICK_SPEED_MULTIPLIER × normalMoveSpeed`;
  - **inertial gesture release** - peak speed derived from EMA-smoothed
    release velocity × `inertiaBoost`.

### 4.2 Handoff invariant

`useMotionRunner` is the only place the controller is started. It runs on
state changes: when `motionPhase` becomes a non-idle value, it samples the
motion origin and builds the segment.

Continuous segment starts are immediate. When a previous segment is still
running (repeated click, opposite-direction click, any interruption), the state
change records the new intent immediately and the successor segment starts from
a **single atomic handoff point**:

- `controller.captureHandoff(startedAt)` returns one coherent
  `{ position, velocity, strategy, timestamp }` — position and velocity are
  read from the *same* sample of the old curve at the same instant;
- `startedAt = handoff.timestamp`;
- the controller publishes the initial sample synchronously and samples future
  RAF ticks directly against the segment wall-clock.

The controller exposes exactly one handoff API, so position and velocity can
never be sourced from two different moments — the boundary makes that mistake
unexpressible. `captureHandoff` does not emit, cancel, or notify subscribers;
it is purely the math. `getSnapshot()` is a separate method for cold UI reads
(the last *emitted* visual frame) and must not be used to assemble a handoff.

For a **cold start** from idle the split is different and intentional: the
logical origin position is owned by the reducer (`state.fromVirtualIndex`,
passed in at the dispatch site), while only residual velocity is read from the
controller snapshot. The motion controller does not own presentation-delay
policy: easing track movement may be presented by WAAPI on the compositor, and
the controller continues publishing the numeric timeline for pagination,
diagnostic, gesture/profile handoff, and settle.

Any future change must preserve the invariant: "intent immediately, the
in-flight handoff taken as one atomic `captureHandoff` point".

When the controller completes, the runner dispatches
`MOTION_SETTLED { settledPosition }`. If a newer click already replaced the
logical target while the previous segment was settling, the reducer re-anchors
the next segment to the actual settled position instead of snapping to the
new target.

### 4.3 No projection-source layer

There is no priority queue, no deferred-frame publisher between the
controller and its consumers. The track binding subscribes to the visual
position directly. The PaginationWidget binding subscribes at the same
level. The two subscriptions are independent listeners on the same RAF
tick - both run in the same frame. `getSnapshot()` is reserved for cold
imperative reads; it returns the emitted visual frame and should not be used
inside per-frame subscribers.

### 4.4 Far GO_TO teleport

A far `GO_TO` cannot animate edge-to-edge — it would mount every intermediate
slide. Instead it is split by one pure geometry resolver (`motion/timing.ts`
`resolveGoToPlan`), consumed by both the reducer and the segment factory so
the logical landing positions and the animated profile can never drift apart:

- **Preflight.** The reducer sets `virtualIndex` to a bounded landing
  `GO_TO_PREFLIGHT_PAGE_SPAN` page screens away from the current position and
  keeps the final target in `teleportVirtualIndex`. `virtualIndex` is kept
  bounded on purpose — the render window is built from it, so the far target
  must not leak in before the teleport. The segment accelerates only inside
  its first page screen, then cruises.
- **Teleport.** When the preflight settles, the reducer teleports
  `fromVirtualIndex` / `virtualIndex` to a bounded origin
  `GO_TO_FINAL_APPROACH_PAGE_SPAN` page screens before the final target and
  clears `teleportVirtualIndex`. Because preflight and approach are both whole
  page-screen counts, the teleport `transform` jump lands on a page boundary
  by construction - no slide is caught part-way through its slot at the cut.
- **Approach.** The approach segment enters at cruise speed on the final page,
  cruises until the configured deceleration distance starts, then decelerates
  to rest at the target.

The speed intent is shared by short and far jumps:
`jumpSpeedMultiplier × normalStepSpeed`. The geometry differs only in how much
of the invisible middle is cut out. Acceleration and deceleration are local
page-screen budgets, so `GO_TO_DECELERATION_DISTANCE_SHARE = 1` means "slow
down over the whole final page screen", not "slow down over the whole jump".
This is the only intentional visual teleport.

---

## 5. Gesture model

The shared `usePointerSwipe` hook is a generic horizontal pointer-swipe
primitive (touch-only, configurable, EMA-smoothed velocity with edge
resistance, intent threshold, quick-flick detection, capture / cooldown).
It is not carousel-specific and is reusable.

`useCarouselGesture` is the carousel-specific adapter. It:

1. on press-start for the non-interactive surface, or on horizontal intent for
   an interactive child: records the visually sampled origin position and the
   slot size (`getSlotSize()`), dispatches `START_DRAG`, then publishes the
   origin into the visual stream via `applyTrackPosition`;
2. on every move payload: translates `uiOffset` into a virtual-index
   delta using the recorded slot size and writes that into the visual
   position via `applyTrackPosition`. No React state per move;
3. on release: computes the swipe target via `resolveDragRelease` (pure
   helper in `domain/dragRelease.ts`) and dispatches `END_DRAG` with the
   resolved target plus the pointer/UI release velocities.

The dispatch carries the velocities into the state machine. They are
stored on the snapshot and read by `useMotionRunner` when it builds the
release segment.

---

## 6. State machine

A reducer-backed state machine in `state/`. Discriminated `CarouselCommand`
union:

- `START_DRAG { fromVirtualIndex, targetPageIndex }` - fires at press-down on
  the non-interactive surface, or after horizontal intent on an interactive
  child.
- `END_DRAG { targetPageIndex, targetVirtualIndex, isSnap, isInstant,
  pointerReleaseVelocity, uiReleaseVelocity }` — fires at gesture release.
- `MOVE { step, moveReason, fromVirtualIndex, isInstant? }` — click /
  controls / autoplay step.
- `GO_TO { targetPageIndex, moveReason, fromVirtualIndex, isInstant? }`
  — pagination click / autoplay loop-back / external jump.
- `MOTION_SETTLED { settledPosition }` — fired by the motion runner when the
  controller completes.

`motionPhase` is a discriminated union:
`"idle" | "step-normal" | "step-jump" | "step-snap" | "step-instant" | "dragging"`.

`moveReason` is `"click" | "gesture" | "autoplay" | null` — `null` is the
pre-action initial state, before the carousel has moved for any reason.

The reducer is pure. Layout / config / instant-mode flow in as a
`context` envelope on every dispatch. Layout reconciliation
(`reconcileStateToLayout`) runs at the top of every transition so a layout
change collapses cleanly to an instant snap.

**ADR-001 — one pure reconcile rule, two boundaries.** `CarouselLayout` is
derived from props that can change without a reducer command. `useCarouselState`
therefore keeps a physical `committedState` from `useReducer`, then projects it
through `reconcileStateToLayout(committedState, layout)` during render and
returns that effective state to all runtime consumers. A resize, data
replacement, or `isFinite` toggle is reconciled immediately even when no user
command fires. The reducer applies the same pure reconciler at the top of every
command, so the physical transition also starts from the live layout. There is
no layout-effect catch-up command and no transient render that exposes a
new-layout / old-state pair to layout effects.

---

## 7. Module synchronisation

Modules attach via the `slot` static convention, resolved by
`resolveSlots` against `CAROUSEL_SLOTS = ["pagination", "controls", "diagnostic"]`.

The `CarouselModuleContext` exposes a partitioned value:

```ts
{
  status: { isIdle, isMoving, isJumping, isDragging, motionPhase },
  layout: { pageCount, canSlide, isAtStart, isAtEnd, isTouch,
            isReducedMotion, isDiagnosticActive },
  intent: { targetPageIndex, moveReason,
            autoplayMotionDuration, autoplayPaginationFactor },
  navigation: { handlePrev, handleNext, handlePageSelect },
  visualPosition: VisualPositionSource | null,  // null when reduced motion
}
```

The context is rebuilt only on input changes (each sub-view is memoised
independently). Modules that need live per-frame updates do **not**
depend on context for the frame value — they subscribe to
`visualPosition` themselves and mutate their own DOM. Modules that only
need the logical view (pagination dots, control availability) read from
the context and re-render at the React tempo.

`Diagnostic`'s presence is surfaced as `layout.isDiagnosticActive` so
modules with their own checks (`PaginationWidget` via
`useWidgetDiagnostic`) run only when diagnostics are wired up.

---

## 8. Slot module reference

### 8.1 `<Pagination />`

Desktop dot pagination. One `PaginationDot` per page. Reads
`intent.targetPageIndex`, `intent.autoplayMotionDuration`,
`intent.autoplayPaginationFactor`, and `layout.pageCount` from the
context. During autoplay, dot switching is delayed by
`autoplayMotionDuration * autoplayPaginationFactor` via `usePaginationSync`. On
click, `navigation.handlePageSelect(pageIndex)` is dispatched as `GO_TO`.

The pagination wrapper carries `aria-hidden="true"`; the dots are pointer
click-targets but are not exposed to assistive tech. Page indication for
screen readers is delivered on the slides themselves via `aria-current="step"`
on the visible band. The slot renders only when the deck can slide
(`shouldRenderPagination` gates on `canSlide`), so a single-page deck shows no
dots — the component carries no internal `pageCount <= 1` guard of its own.

### 8.2 `<PaginationWidget />`

Touch dot pagination. A fixed-width odd-count strip (5 dots default) with
exponentially shrinking side dots. Two `activeDot` overlays interpolate
across adjacent page indexes to track the visual progress, not the
logical target. Subscribes to `visualPosition` and mutates dot
`transform` / `opacity` per RAF tick. When reduced motion is on, the
widget falls back to a single static dot reflecting the logical target.

### 8.3 `<Controls />`

Edge navigation zones. Hidden by default on desktop, shown on
viewport-hover or `:focus-visible`. Always visible on touch. The
left/right zones are not rendered when `layout.isAtStart`/`isAtEnd` is
true (finite mode), so there is no destination to navigate to.

### 8.4 `<Diagnostic />`

DEV-only console emitter. Reads
`CarouselDiagnosticContext` (raw props + observable layout/slot state)
and runs check sets under `modules/Diagnostic/checks/`:

- `propChecks` — public input validity.
- `constantChecks` — internal constants ranges.
- `layoutChecks` — page layout consistency (perfect-page coverage,
  `canSlide`/`pageCount` invariants).
- `widgetChecks` — PaginationWidget prop sanity.

Output format (one line per warning, built by `formatter.ts`):

```
[Carousel Diagnostic][SEVERITY] <Layer> -> <field> has value <actual>. \
[Runtime normalizes it to <normalizedTo>.] <Expected …>. <Consequence>. \
Diagnostics is observe-only and does not apply runtime changes.
```

`SEVERITY` is `CRITICAL` or `LOGICAL`. The `normalizedTo` clause appears only
when runtime applies an explicit normalization (the overallocated
acceleration/deceleration profile share). Warnings are deduplicated by
signature across renders.

---

## 9. Folder graph

```
src/components/Carousel/
├── ARCHITECTURE.md                this document
├── Carousel.tsx                   composition root, no business logic
├── Carousel.module.scss
├── index.ts                       public re-exports
├── contract/                      public schemas, inferred types, class keys
├── config/                        config resolution
│   ├── defaults.ts                public-prop defaults
│   ├── constants.ts               tunable runtime constants (epsilons, buffers)
│   ├── motion.ts                  bezier strings, repeated-click + GO_TO factors
│   ├── gesture.ts                 drag config + inertial release config
│   ├── interaction.ts             hover delay, visibility threshold, autoplay pagination factor
│   ├── buildRawConfig.ts          merges raw input with defaults
│   ├── types.ts                   CarouselRuntimeConfig + sub-shapes
│   └── useCarouselConfig.ts
├── context/
│   ├── CarouselModuleContext.ts   module-facing value
│   ├── CarouselDiagnosticContext.ts  raw props/layout/slots for Diagnostic
│   ├── useModuleContextValue.ts
│   └── types.ts
├── domain/                        pure functions, no React
│   ├── math.ts                    clamp, mod, normalizePageIndex, shortestCyclicDistance
│   ├── slides.ts                  record building, partial-page detection, extension
│   ├── layout.ts                  CarouselLayout factory, page/virtual conversions
│   ├── renderWindow.ts            windowing math
│   ├── visibility.ts              slide active/actual decision
│   ├── track.ts                   transform string builders, slot-size measurer
│   └── dragRelease.ts             release-target resolver
├── state/
│   ├── types.ts                   CarouselState, Command, MotionPhase, MoveReason
│   ├── initial.ts                 initial state factory + motionStatus
│   ├── reconcile.ts               layout reconciliation
│   ├── transitions.ts             pure step / repeated-click / drag transitions
│   ├── reducer.ts                 single switch over Commands
│   └── useCarouselState.ts        binds the reducer to React
├── motion/
│   ├── types.ts                   Segment, MotionIntent, MotionStart
│   ├── bezier.ts                  cubic-bezier sampler + cache + carousel curves
│   ├── profile.ts                 smoothstep profile (accel/cruise/decel)
│   ├── speed.ts                   sameDirectionSpeed, signedVelocity
│   ├── timing.ts                  GO_TO speed + teleport geometry (resolveGoToPlan)
│   ├── duration.ts                bezier-segment duration math
│   ├── segmentFactory.ts          builds the Segment for the next motion step
│   ├── sampler.ts                 segment → MotionSampleData at timestamp
│   ├── useMotionRunner.ts         state → segment → controller
│   └── useCarouselMotionExecution.ts  runner + motion-duration publication
├── position/
│   ├── types.ts                   VisualPositionFrame, VisualPositionSource
│   └── useVisualPosition.ts       VisualPositionSource owner
├── geometry/
│   └── useTrackBinding.ts         ResizeObserver + slot measure + transform writer
├── gesture/
│   └── useCarouselGesture.ts      pointer-swipe → dispatch + visual position writes
├── autoplay/
│   └── useAutoplay.ts
├── focus/
│   └── useFocusRecovery.ts
├── navigation/
│   └── useCarouselNavigation.ts   public click handlers
├── status/
│   └── statusSnapshot.ts          onCarouselStatusChange snapshot equality
├── slides/
│   ├── SlideItem.tsx
│   ├── SlideItem.types.ts
│   ├── imageResource/             image-resource SSOT (store + React bridge)
│   │   ├── createImageResourceStore.ts  framework-agnostic store
│   │   ├── context.ts             per-carousel store provider
│   │   ├── useImageResource.ts    per-slide useSyncExternalStore binding
│   │   ├── useImageResourceStoreInstance.ts  lifecycle owner
│   │   └── types.ts
│   ├── useSlideImagePreload.ts     idle warm-up window → image-resource store
│   ├── useCarouselSlideDeck.ts    layout, records, perfect-page info
│   └── useSlideRenderModel.ts     virtual slides + render window
├── slots/
│   └── slotNames.ts               CAROUSEL_SLOTS + CarouselSlotComponent
├── render-policy/
│   └── useModuleRenderPolicy.ts
└── modules/
    ├── Controls/
    ├── Pagination/
    ├── PaginationWidget/
    └── Diagnostic/
```

Reading order for someone new:

1. `contract/` — public surface: schemas, inferred types, class-key constants.
2. `Carousel.tsx` — top-down composition.
3. `state/types.ts` and `state/reducer.ts` — what the carousel knows
   about itself.
4. `motion/types.ts` and `motion/segmentFactory.ts` — how a logical step
   becomes a visual segment.
5. `position/useVisualPosition.ts` — how the visible position is sampled
   and exposed.
6. `motion/useMotionRunner.ts` — how a state change becomes a controller
   start; the handoff invariant (§4.2).
7. `geometry/useTrackBinding.ts` — how the track DOM is written.
8. `gesture/useCarouselGesture.ts` — how a touch swipe ends up as a
   dispatch.
9. The modules.

If a future reader can follow that order without bouncing for inverse
dependencies, the architecture has held.

---

## 10. Trade-offs

- **Environment is injected, not self-detected.** The carousel never reads
  `matchMedia` / `navigator` itself; `reducedMotion` / `touch` / `dataSaver`
  arrive through the `userEnvironment` prop. This keeps the component a pure
  function of its props — trivially SSR-safe and testable without mocking
  globals — and gives the host one environment source. The trade-off is the
  loss of zero-config behaviour: a host that fails to wire `useUserEnvironment`
  gets full motion (no `prefers-reduced-motion` respect), desktop behaviour,
  and no data-saver skip. That omission is made loud by the Diagnostic slot
  rather than silently repaired — consistent with the observe-only philosophy.
  If the carousel is ever extracted into a standalone library consumed by
  unknown hosts, reinstate an internal `prefers-reduced-motion` fallback for
  the accessibility-critical signal.
- **Per-frame mutation in track binding and PaginationWidget.**
  Deliberately bypasses React rendering. The trade-off is that DOM
  manipulation lives outside React's reconciler; the alternative (state
  per frame, context per frame) would re-render every consumer at 60 Hz
  for purely visual data. The pattern is contained — both hooks own
  their own DOM refs and subscribe through the same single API.
- **Visual position is global per-instance, not via context.** Every
  consumer takes it as an explicit dependency through props (Carousel
  internals) or through the module context value (modules). This makes
  the data flow visible in source rather than relying on hidden context
  provider scope.
- **State machine reads `fromVirtualIndex` from the gesture/click site,
  not internally.** Callers pass the visually-sampled origin as part of
  the dispatch payload. The state machine never reaches into the motion
  controller. This keeps the state machine pure (testable without any
  DOM / RAF context).
- **Render-window keeps its expanded shape during a motion segment.**
  The window only shrinks back when motion settles. This avoids
  unmounting a slide mid-flight if the window edges shift; it costs at
  most one extra rendered slide pair during fast direction switches.
- **ADR-002 - trusted runtime inputs, external validation boundary.** Public
  props, injected environment signals, slide IDs, numeric config values, slot
  attachment, and CSS/class overrides are treated as caller-owned runtime
  values. The carousel applies documented defaults only for `undefined` public
  props; it does not validate, coerce, repair, deduplicate, or enforce these
  values during production runtime. The host application owns data hygiene
  before render (for example with the exported Zod schemas when data comes
  from an API, CMS, or user config). When observability is needed in
  development, the host mounts the Diagnostic slot: it reports missing or
  invalid inputs and invariant risks, but never feeds corrected values back
  into the carousel. The trade-off is deliberate: invalid input should fail
  visibly at the integration boundary, while the production component stays
  small, predictable, and free of defensive validation branches.
- **Diagnostic is strictly observe-only.** The runtime values the
  carousel uses do not depend on whether the Diagnostic slot is attached.
  Diagnostic never normalises, validates, repairs, or substitutes any
  value; it reads and warns. When runtime profile math intentionally
  normalizes overallocated acceleration/deceleration shares, Diagnostic
  reports the normalized shape without participating in the decision. The
  trade-off is that the carousel will visibly misbehave when fed invalid
  inputs (NaN propagation, impossible geometry, malformed transforms) —
  which is the intended signal that the input must be fixed.
- **`onCarouselStatusChange` is observation-only.** It never drives carousel
  semantics and never receives reducer state or per-frame motion data — only a
  `{ isIdle, currentPageIndex, pageCount, isAtStart, isAtEnd }` snapshot.
  Internal image preparation uses the carousel's own idle status directly; the
  callback is purely for application-owned, low-frequency consumers (a page
  label, non-critical work scheduling, external prev / next button state).
- **The imperative `ref` handle is command-only.** `prev()` / `next()` express
  intent; the carousel still decides admissibility (boundaries, finite/cyclic,
  reduced motion, repeated-click). The handle exposes no state and no `goTo`,
  so external code never learns reducer / controller / virtual-index internals
  and there is exactly one navigation pipeline.

---

## 11. Quality protections

- **TypeScript.** Discriminated unions for `CarouselCommand`,
  `MotionPhase`, `MoveReason`, `CarouselSegment`, `CarouselMotionIntent`.
  No `any`.
- **Public Zod schemas.** `CarouselPropsSchema` and `CarouselSlidesDataSchema`
  are exported (see `index.ts`) for the **host application** to validate data
  from external sources — API responses, CMS, user config — before passing it
  as `slidesData`. The component itself does **not** runtime-validate its own
  props: invalid input propagates and is surfaced by the `Diagnostic` slot as
  DEV-only warnings, keeping the failure mode visible at the source. The
  schemas are a tool for the host, intentionally unused inside the component.
- **Schema/runtime boundary.** The public contract lives under `contract/`.
  Zod schemas in `contract/schemas.ts` are the source of truth for runtime
  shapes; `contract/types.ts` derives TypeScript types from them with
  type-only imports. Importing the carousel component does not import `zod`.
  Hosts that import the schemas for production runtime validation intentionally
  pay that bundle cost and own any fallback substitution before props reach
  the carousel.
- **React safety.** Per-frame work never touches React state. State
  machine dispatches are batched by React. Effects are pure; cleanup is
  explicit. `useIsomorphicLayoutEffect` is used for DOM measurement,
  subscription wiring, and synchronous visual coordination.
- **Strict Mode.** The motion controller cleanups handle remount; the
  visual position subscription returns a cleanup that disconnects from
  the controller.
- **Runtime safety.** Layout reconciliation tolerates page-count changes
  and resets on `dataKey` changes. Numeric inputs are *not* generally
  coerced or repaired — invalid input is intentionally allowed to propagate so
  the failure mode is visible. The only runtime normalization is the
  profile-level rule for overallocated acceleration/deceleration shares. The
  diagnostic layer surfaces violations separately, without ever feeding back
  into runtime.
- **Performance.** Bezier and profile samplers cache their work where
  the inputs are known (parsed beziers, computed strips). The track binding
  short-circuits duplicate transforms and can hand plain easing movement to
  WAAPI so the deck transform is presented by the compositor while the JS
  controller keeps publishing the numeric timeline. The PaginationWidget
  binding short-circuits writes per dot using visual thresholds. The motion
  controller emits only on active-segment RAF ticks and never emits while idle.
  Image preload/decode is scoped to the slide layer and starts only from idle
  states.
