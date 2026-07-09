# Carousel

A React 19 carousel deck with motion-controller-driven track movement, touch
gesture, fast repeated-click acceleration, autoplay, dot pagination, an alternative
touch pagination widget, edge controls, and a dev-only diagnostic slot.

The component is a single composition root (`Carousel.tsx`) plus four pluggable
slot modules. Every motion is ONE model: an accel/cruise/decel **profile**
(constants-authored distance shares — there are no easing curves anywhere). The
engine computes each motion once, normalizes its temporal shape into a
percent-progress curve (uniform stops), and every paint consumer encodes those
stops as its own WAAPI keyframes — the track over its pixel distance, the
pagination widget over one dot step — same duration, same curve, same clock, so
they run in phase on the compositor with zero per-frame work, on any engine
with `Element.animate`. Per-frame JS drawing happens ONLY while a finger drags
the deck (both track and widget follow the visual stream), and as a total
fallback on engines with no WAAPI at all — where both consumers also drop the
same Nth frames via one shared pacing rule. The JS motion controller still samples
every segment: it stays the visual-position SSOT for handoff, settle, status,
and the drag/fallback stream. See §4.5.

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
equal halves with no cruise zone, and Diagnostic reports that normalized shape.

#### Slides

| Prop          | Type            | Default | Effect |
| ------------- | --------------- | ------- | ------ |
| `slidesData`  | `Slide[]`       | —       | Required. `Slide = { id; content; alt?; image? }` — see §1.4.1. `content` must be a trimmed-non-empty string, a number, or a React element, and is the slide's **identity** (it alone, with `id`, feeds `dataKey`). `image` is optional render-only responsive variants. |
| `visibleSlidesNr` | `number`     | — | How many slides share the viewport. Drives layout flex-basis, slot-size measurement, page math (`pageCount = ceil(slidesData.length / visibleSlidesNr)`), and the PaginationWidget projection slot count. |
| `isPagePaddingOn` | `boolean`    | — | When on, pads the deck with cloned tail slides so `length` becomes a multiple of `visibleSlidesNr`. Eliminates partial pages at the tail. |
| `isContentImg` | `boolean`      | — | When on, treats string `content` as an `<img src>`. When off, renders raw `content`. Image errors fall back to `slide.alt` or `errAltPlaceholder`. |
| `errAltPlaceholder` | `string`  | — | Used when an image fails to load and the slide has no `alt`. |

#### Layout / motion mode

| Prop            | Type      | Default | Effect |
| --------------- | --------- | ------- | ------ |
| `isFinite`      | `boolean` | — | When on, the track stops at the boundaries (no wrap, `isAtStart`/`isAtEnd` flag the edges). When off, the track loops cyclically and `GO_TO` always travels the shortest cyclic distance. |

#### User environment

The carousel does **not** detect the device/OS environment itself — it is a
pure function of its props. The host injects the environment via a single
optional object prop. The recommended source is the `useUserEnvironment` hook
in `shared`, which composes the individual detection hooks and returns a
referentially-stable object.

| Prop              | Type             | Effect |
| ----------------- | ---------------- | ------ |
| `userEnvironment` | `{ reducedMotion?: boolean; touch?: boolean; dataSaver?: boolean }` | All fields optional. `reducedMotion`: every transition snaps instantly, gesture is disabled, the PaginationWidget runs static. `touch`: gesture eligibility, `data-touch` attribute, autoplay hover-pause exemption. `dataSaver`: off-band slide images load lazily and at low fetch priority. An unset field resolves to `false`; the omission is reported by the `Diagnostic` slot (DEV-only) — never silently repaired. |

#### Motion timing

| Prop              | Default | Effect |
| ----------------- | ------- | ------ |
| `durationAutoplay` | — | Duration of an autoplay-driven page step. |
| `intervalAutoplay` | — | Idle interval between two autoplay steps. |
| `durationStep`    | — | Base duration of duration-authored click / gesture-driven steps. Repeated-click profile segments instead derive their duration from their speed profile. Multi-page click distances scale linearly. |
| `jumpSpeedMultiplier` | — | `GO_TO` peak cruise speed as a multiple of the normal one-step speed. A jump's duration is derived from distance and this multiplier, so a near and a far jump share one consistent speed. Drives short jumps and the bounded segments of a far-jump teleport alike. |

All public-prop defaults (and every tunable) live in `config/` — see §1.7.
This document does not restate them, so it cannot drift from the code.

#### Module gates

| Prop             | Default | Effect |
| ---------------- | ------- | ------ |
| `isAuto`         | — | Master autoplay switch. When `false`, the `setTimeout` loop never runs. Autoplay also auto-pauses when (a) the viewport is less than `VISIBILITY_THRESHOLD` on screen, (b) the user is dragging or motion is in progress, (c) on desktop only, the pointer hovers the viewport (`HOVER_PAUSE_DELAY` debounce). On the final page in finite mode it loops back to page 0 via `GO_TO`. |
| `isPaginationOn` | — | Gates the rendering of the attached `Pagination`/`PaginationWidget` slot. If the prop is `true` but no pagination slot is attached, nothing renders; the slot must opt in by being placed in `children`. |
| `isControlsOn`   | — | Same contract as `isPaginationOn`, for the `Controls` slot. |
| `isInteractive`  | — | When on, a slide whose image has loaded successfully and that has an `onSlideClick` handler renders as a `<button>`. When off, slides are never interactive even with a handler. |

#### Callbacks

| Prop                       | Type | Effect |
| -------------------------- | ---- | ------ |
| `onSlideClick`             | `(slide: Slide) => void` | Fires when an interactive slide is clicked. The slide is interactive only when `isInteractive`, the image (if any) loaded successfully, and this handler is provided. |
| `onCarouselStatusChange`   | `(snapshot: CarouselStatusSnapshot) => void` | Low-frequency, **observation-only** status. `CarouselStatusSnapshot = { isIdle, currentPageIndex, pageCount, isAtStart, isAtEnd }` — two numbers (which page, of how many), the idle flag, and the two boundary flags (always `false` in cyclic mode). Fires on mount and whenever one of those changes; `currentPageIndex` is the *target* page, so it reflects intent immediately on click/gesture. `isAtStart` / `isAtEnd` are the same boundary flags the internal `<Controls>` slot uses to hide its zones — hosts driving the carousel through the imperative handle can wire them to `disabled` on external prev/next buttons. Carries no per-frame data (position, velocity) and no reducer internals. Deduplicated by a shallow snapshot compare. |

#### Imperative handle

| Prop  | Type | Effect |
| ----- | ---- | ------ |
| `ref` | `Ref<CarouselHandle>` | `CarouselHandle = { prev(): void; next(): void }`. Single-step navigation for external buttons elsewhere on the page or programmatic control. Routes through the same navigation pipeline as `<Controls>` (no second control path) and is a safe no-op when the deck cannot slide. Page jumps (`GO_TO`) are deliberately not exposed — they stay internal, reached through the pagination slot. |

#### Styling

| Prop        | Type           | Effect |
| ----------- | -------------- | ------ |
| `className` | `ClassNameMap` | Partial map keyed by `outerContainer`, `innerContainer`, `slideContainer`, `slide`, `slideInteractive`, `slideError`, `slideText`. Merged into the deck SCSS via `mergeStyleMaps`. Keys not provided fall back to the built-in styles. |

#### Responsive images (`Slide.image`)

A slide's `content` is its **identity** (with `id` it is the only thing in
`dataKey`) and doubles as the fallback `<img src>`. Responsive variants are
carried separately, in an optional **render-only** `image` object — so the
browser can pick a per-resolution / per-orientation asset without ever changing
identity:

```ts
interface SlideImageSource {
  media: string;            // e.g. "(orientation: landscape) and (max-height: 520px)"
  srcSet: string;           // "crop-480.webp 480w, crop-720.webp 720w"
  sizes?: string;           // defaults to the carousel's auto value
  type?: string;            // e.g. "image/webp"
}
interface SlideImageVariants {
  srcSet?: string;          // resolution candidates for the default <img>
  sizes?: string;           // override the auto value (rarely needed)
  sources?: SlideImageSource[]; // art-directed <source> overrides
}
interface Slide {
  id: string | number;
  content: string | number | ReactElement; // identity + fallback src
  alt?: string;
  image?: SlideImageVariants;               // render-only; NOT in dataKey
}
```

Contract guarantees:

- **Identity is `id` + `content` only.** `image` never enters `dataKey` or
  reconciliation, so adding, removing, or switching variants — including swapping
  an orientation crop on device rotation — **never resets the viewing position**.
  Keep `content` stable across orientations; vary only `image`.
- **`sizes` is supplied by the carousel.** It owns slot geometry, so it injects a
  default `sizes` derived from `visibleSlidesNr` (≈`100 / visibleSlidesNr` vw)
  onto the `<img>` and each `<source>`. This prevents the `srcSet`
  "no `sizes` → assume `100vw` → oversized candidate" trap. A slide's own
  `image.sizes` / `source.sizes` overrides it for the rare exception.
- **`<source>` is for exceptions; `<img>` is the default.** When `image.sources`
  is present the slide renders a `<picture>` (each `source` → a `<source>`), with
  the default `<img srcset={image.srcSet}>` as the fallback. Place portrait/normal
  candidates in `image.srcSet`; reserve `sources` for art-directed crops.

#### Host how-to: one source image → responsive `slidesData`

For each logical slide you need, starting from a single high-resolution source:

1. **Produce the variant files.** Two axes — resolution and (optionally)
   orientation crop:
   - a wide 16:9 cut (`wide/`): a resolution ladder (the demo cuts up to
     480/720/1080/1600w);
   - a tall 9:16 crop of the SAME photos (`tall/`) for portrait viewports —
     art direction changes the crop, never the picture.

   The demo serves them from `public/carousel/<collection>/<crop>/<width>/carouselN.webp`
   (so they have stable URLs, not bundler-hashed ones). In production they'd
   typically sit on a CDN. Any layout works — the host owns file organisation.
2. **Generate the content document with the `data-gen` kit.** The carousel ships
   a self-contained generator (`Carousel/data-gen/` — Node-only, imports nothing
   from the component, so it can be copied to wherever the assets live). It reads
   the variant folders and writes a static `Slide[]` JSON, encoding every
   convention by construction: canonical fallback = smallest candidate,
   `w`-descriptor `srcSet`s, `sizes` left to the carousel. Point it at a config:
   ```jsonc
   // carousel-data.config.json
   {
     "assetsDir": "public/carousel",
     "urlBase": "/CarouselCC/carousel/",
     "output": "public/carousel-slides.json",
     "variants": [
       { "subdir": "nature/wide/480", "width": 480 },
       { "subdir": "nature/wide/720", "width": 720 },
       { "subdir": "nature/wide/1080", "width": 1080 },
       { "subdir": "nature/wide/1600", "width": 1600 }
     ],
     "sources": [
       { "media": "(orientation: portrait)", "type": "image/webp",
         "variants": [ { "subdir": "nature/tall/480", "width": 480 }, { "subdir": "nature/tall/720", "width": 720 } ] }
     ]
   }

   One geometry contract binds the data to the styles: the slide box's
   `--slide-aspect` (SCSS) must equal the aspect of the set the browser
   selects, under the SAME media condition — the demo pairs the default
   16:9 set with `--slide-aspect: 16 / 9` and the portrait 9:16 source with
   an `(orientation: portrait)` override. Box aspect === asset aspect is
   what makes `object-fit: cover` a no-op (the image fills the slide with
   nothing cropped), and the carousel derives its height from slot width ×
   aspect instead of a fixed height, so it fits any window.
   ```
   ```bash
   npm run gen:carousel   # tsx Carousel/data-gen/cli.ts carousel-data.config.json
   ```
   The generator is **orientation-neutral** (the *default* asset is whatever is
   in `variants`; a natively-landscape deck puts landscape there) and
   **idempotent**: it identifies a slide by its asset slug, so regeneration
   preserves each slide's `id` and hand-written `alt`, mints ids only for new
   assets, and drops removed ones. `content` (identity + fallback) is the
   smallest candidate, fixed across viewports — that is what keeps the position
   on rotation. Run it **once, offline** (build box / server / CDN pipeline); it
   is not part of the app build. See `data-gen/README.md`.
3. **Fetch and render.** The demo's `App` does `fetch → render` with loading /
   error (transport) states and consumes the document as-is. Validation is
   deliberately **not** part of this flow — if a host wants to validate the
   external document it does so as a separate concern, for which the carousel
   still exports `CarouselSlidesDataSchema` (ADR-002). The carousel itself never
   validates at runtime.
4. **Ship one set, not per-device arrays.** Do **not** swap `slidesData` on a
   breakpoint/orientation change — that changes `content` and resets the deck.
6. **`sizes` is automatic** — do not pass it unless a slide genuinely needs to
   override the carousel's `visibleSlidesNr`-derived value.

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
- **Repeated click (same direction during motion).** The destination
  tracks **two pages ahead of the live visual page**, never further. A
  same-direction MOVE click during motion does not just speed up the
  active segment — it **skips past** the page the deck is already heading
  to. The cursor is anchored on the live visual page
  (`floor(fromVirtualIndex / stepSize)` for `+1`,
  `ceil(fromVirtualIndex / stepSize)` for `-1`) instead of on
  `state.targetPageIndex`, and the effective step is doubled, so
  `nextTargetPageIndex = visualPage + 2 * direction`. While visual is
  still inside the current page, repeat clicks resolve to the same target
  and no segment rebuild is needed beyond the live `fromVirtualIndex`
  refresh; as soon as visual crosses into the next page, the next rapid
  click advances `targetPageIndex` by one more page. The motion runner
  observes any of those changes through its dependency key and rebuilds
  the active segment with the fast-repeat profile (peak speed
  `REPEATED_CLICK_SPEED_MULTIPLIER` of a normal MOVE). The deck therefore
  keeps moving continuously through pages while the spam continues, but
  the destination can never get more than two pages ahead of what the
  user actually sees. When clicks stop, motion finishes the in-flight
  segment and settles. There is no separate admission buffer and no
  special path through `useCarouselNavigation`; the destination rule lives
  entirely inside `stepOrigin` + the `effectiveMoveStep` doubling in
  `state/transitions.ts`. The retarget rebuild happens synchronously in the
  same commit — the previous compositor animation keeps painting the pixels
  until the new one replaces it, so the rebuild cost never shows on screen.
  The handoff is a single atomic `captureHandoff` (§4.2).
- **Drag / swipe.** Touch only (pointer events with `pointerType === "touch"`).
  EMA-smoothed velocity, edge resistance with a configurable curvature.
  Release resolves to a swipe direction via either a quick-flick (raw
  velocity + raw offset) or a distance-based threshold
  (`swipeThresholdRatio` of the viewport width with a hard min). When the
  intent is `NONE`, the track snaps back via the snap-back curve over
  `SNAP_BACK_DURATION`.
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
  reflect the boundary state on external prev / next buttons (`isAtStart` /
  `isAtEnd` are the same flags the internal `<Controls>` uses to hide its
  zones; in cyclic mode both are always `false`). It carries no per-frame
  data and no reducer internals; the carousel still runs its own image
  preparation for nearby slides while idle, independent of this signal.
- **External imperative control.** A `ref` of type `CarouselHandle` exposes
  `prev()` / `next()` for buttons outside the carousel subtree or programmatic
  use. Both route through the same navigation pipeline as `<Controls>` —
  there is no second control path. In finite mode the handle's `prev` / `next`
  are safe no-ops at the edges; hosts can also surface that state on the
  button itself by wiring `disabled` to the matching `isAtStart` / `isAtEnd`
  flag from the status snapshot.
- **Image preparation.** One lightweight mechanism — no warm-up state
  machine, no decode queue, no coupling to the render-status store: **native
  selection + prioritization on the rendered element**. A slide's responsive
  variants (`Slide.image`, §1.4) render as `srcSet` / `<picture>`, so the
  browser picks the right asset per resolution/DPR and orientation — the
  carousel supplies `sizes` from its slot count. Each `<img>` also carries
  band-derived hints: the active band fetches eagerly and at high
  `fetchpriority`; off-band slides fall back to default. Under
  `userEnvironment.dataSaver` (derived from `prefers-reduced-data` / the
  Network Information API `saveData` flag, e.g. through `useUserEnvironment`)
  off-band slides instead load lazily and at low priority. Ahead-of-motion
  readiness comes from the render window itself: every slide a single click
  or a repeated click can reveal is already MOUNTED while idle
  (`RENDER_WINDOW_BUFFER_MULTIPLIER` covers the same span the reducer's
  repeated-click lookahead can reach), so its `<img>` fetches long before any
  motion starts. (A former idle-predecode hook that mirrored descriptors into
  offscreen `Image()`s was removed as fully redundant once the buffer grew to
  cover its span; if decode pop-in is ever observed on weak devices, the lean
  reintroduction is `img.decode()` over the mounted off-band images, not
  descriptor mirroring.)

  This changes no navigation, layout, motion state, or slide-render
  semantics. The image-resource store — its render-status SSOT and error /
  retry — is unaffected and always runs; that is correctness, not optimization.
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
  `autoplayMotionDuration * AUTOPLAY_PAGINATION_FACTOR` (a fraction of the
  animation) — this matches the historical product behaviour where
  autoplay rolls the dot later than the visual.
- **PaginationWidget (touch).** A fixed-width odd-count widget (dot count
  configurable via internal `PAGINATION_WIDGET_DEFAULTS`). Centre
  dot is largest; sides shrink exponentially by `scaleFactor`.
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
  viewport. On desktop they are hidden by default and revealed on viewport
  hover or focus (`:has([data-carousel-viewport]:hover)`,
  `:has(*:focus-visible)`). On touch they are visible by default.
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

### 1.7 Where the tunable values live

This document deliberately does **not** enumerate concrete constant values.
Numbers (durations, multipliers, distance shares, easing curves, epsilons,
dot counts, thresholds) are feel/tuning and change frequently; duplicating them
here only invites doc/code drift. The single source of truth is `config/`:

- `config/defaults.ts` — public-prop defaults.
- `config/motion.ts` — motion-profile distance shares (step / autoplay /
  snap-back / repeated-click / GO_TO) and the GO_TO teleport spans.
- `config/interaction.ts` — hover delay, visibility threshold, autoplay dot factor.
- `config/gesture.ts` — swipe + inertial-release config.
- `config/constants.ts` — epsilons, render-window buffer.
- `modules/PaginationWidget/defaults.ts` — widget geometry + write epsilons.

These values are part of the visual contract: changing them changes how the
component *feels*, so they are not safe to tune without a UX review. The
`Diagnostic` slot range-checks them at runtime (DEV-only). This document
describes *what* each constant governs (see §4, §5, §8); the value itself is
read from `config/`.

---

## 2. Ownership model

Every responsibility has exactly one owner. The orchestrator
(`Carousel.tsx`) wires them.

| Concern | Owner | Notes |
| --- | --- | --- |
| Public props | `Carousel.tsx` | Frozen contract, declared in `types.ts`. |
| User environment | host application | Injected via the `userEnvironment` prop. The carousel never detects `prefers-reduced-motion` / touch / data-saver itself; the host reads them (recommended: `useUserEnvironment` in `shared`) and passes a stable object in. |
| Resolved runtime config | `useCarouselConfig` | One memo. Substitutes defaults only for `undefined` props; never normalises explicit values. Motion-profile share normalization happens later inside the profile builder, not in config. |
| Slide records | `useCarouselSlideDeck` | Builds slide records, optionally extends to fill perfect pages. |
| Layout facts | `useCarouselSlideDeck` | `length`, `visibleSlidesCount`, `pageCount`, `virtualLength`, `canSlide`, `isFinite`, `dataKey`. |
| Logical state | `useCarouselState` | Reducer-backed. Owns `targetPageIndex`, `fromVirtualIndex`, `virtualIndex`, optional `teleportVirtualIndex`, `isTeleportApproach`, `motionPhase`, `gesture`, `isRepeatedClickAdvance`, `moveReason`. |
| Visual sampled position | `useVisualPosition` | Wraps a single `MotionController`. Sole SSOT for the visible track offset. |
| Motion execution | `useCarouselMotionExecution` + `useMotionRunner` | Owns motion-duration publication and settle feedback, then reads logical state, builds a segment, calls into the controller, and routes compositor-eligible easing segments to the track binding's WAAPI path (§4.5). |
| Track DOM | `useTrackBinding` | Measures slot size and subscribes to visual position; writes `transform`. Also owns the compositor (WAAPI) animation for plain easing steps and suppresses its own per-frame write while that animation runs (§4.5). |
| Render window | `useSlideRenderModel` | Memoised; expands during motion, snaps on idle. |
| Image resources | image-resource store (`createImageResourceStore`) | Per-URL render status and retry policy. One instance per carousel; the single authority on image renderability. |
| Image prioritization | `SlideItem` | Native `<img loading>` / `fetchpriority` hints derived from the slide's band and the data-saver signal. |
| Slide image binding | `useImageResource` | Registers a `SlideItem` as a visible owner of its URL and subscribes to the URL's snapshot via `useSyncExternalStore`. |
| Gesture lifecycle | `useCarouselGesture` | Wraps the shared `usePointerSwipe`. Converts pointer events into dispatches and direct position writes. |
| Autoplay lifecycle | `useAutoplay` | Owns the interval timer, hover/visibility/dragging pause. |
| Focus shift | `useFocusRecovery` | Triggers when the state settles. |
| Module API | `useModuleContextValue` | Builds the value once, memoised; derives the status view from `state.motionPhase` itself. |
| Diagnostic context value | `useDiagnosticContextValue` | Mirrors raw props + observable layout/slot state for the Diagnostic slot. |
| Host status snapshot | `useCarouselStatusReporter` | Deduplicated low-frequency `onCarouselStatusChange` emission. |
| Module render policy | `useModuleRenderPolicy` | Single owner of slot-attachment checks (`hasControlsSlot`, `hasPaginationSlot`, `hasDiagnosticSlot`) and of the rules that gate whether the Controls, Pagination and Diagnostic slots render. |
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
   `isContentImg` is on). Holds one entry per image URL: render `status`
   (`loading | loaded | error`) plus a retry `generation`, with one capped,
   backed-off retry timer per URL. The store is passed explicitly into each
   `SlideItem` (not via context); the slide subscribes to its URL via
   `useImageResource` and reports the real `<img>` outcome back via
   `reportLoaded` / `reportError`, which is authoritative. "Has this slide's
   image failed" is a *derived read* of this SSOT, never a second copy of
   state. Observation-only: it never feeds navigation, layout, or motion.
   Prioritization is not modeled here — it is delegated to native `<img>`
   hints on the rendered element (see §1.6).

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
- `getSnapshot()` returns the last emitted visual frame.
- `sampleNow()` returns the exact position from the controller's curve at
  `now()` — reflow-free, and ahead of `getSnapshot()` by the sub-frame elapsed
  since the last emit during a live segment.
- A cold read that starts a new segment (gesture press, navigation click) wants
  the origin to match *what is actually painted*. The track binding chooses
  per-source: while the track is **JS-driven**, the last emitted frame *is* what
  was painted, so `getSnapshot()` is used (a fresh controller sample would be
  ahead of the paint); while a **compositor** animation owns the track it has
  painted ahead of the last emit, so `sampleNow()` is the closer match. Neither
  path reads the DOM — the painted position is recovered from the controller's
  own math, never `getComputedStyle`.
- `applyImmediatePosition(position)` — publish a position into the stream
  during drag. Internally calls `controller.set`, which cancels any
  active motion and emits, so the track, the widget, and the motion
  runner all observe one consistent source of truth throughout the
  gesture.

### 4.1 Segments

`CarouselSegment` (`motion/types.ts`) has exactly ONE shape: a smoothstep-driven
acceleration / cruise / deceleration **profile**. There are no easing curves —
every motion is authored through the same constants model (distance shares for
ramp-up and ramp-down; the remainder is cruise). If acceleration and
deceleration shares sum above `1`, runtime normalizes the profile to equal
halves with no cruise zone. Two authoring modes feed the same builder:

- **Duration-authored** (strategy `"step"`): click step, autoplay step,
  snap-back, and a non-inertial gesture release. The step kind picks its shares
  (`motion.stepProfile` / `motion.autoplayProfile` / `motion.snapBackProfile`),
  and the peak speed falls out of distance + duration
  (`resolvePeakSpeedForDuration`). A hot handoff's velocity becomes the
  profile's start speed, so retargets stay velocity-continuous.
- **Speed-authored**: start / peak / end speeds plus zone distances derive the
  segment duration.
  - `"jump"` — **every GO_TO**, at `jumpSpeedMultiplier × normalStepSpeed`. A
    short jump uses one segment with local first-screen acceleration and local
    final-screen deceleration; a far jump uses a preflight segment, a position
    teleport, and a fixed one-page approach (§4.4).
  - `"repeated"` — **repeated-click fast advance**, one segment directly to the
    next page boundary, peak speed `REPEATED_CLICK_SPEED_MULTIPLIER ×
    normalMoveSpeed`.
  - `"gesture"` — **inertial gesture release**, peak speed derived from
    EMA-smoothed release velocity × `inertiaBoost`.

Every segment's temporal shape is then normalized into the percent domain
(`profileProgressStops`: uniform time samples of distance-progress 0→1) and
delivered to consumers as-is — each encodes the stops into its own WAAPI
keyframes, the single consumer-agnostic artefact both the track and the
pagination widget animate with (§4.5).

### 4.2 Handoff invariant

`useMotionRunner` is the only place the controller is started. It runs on state
changes inside a layout effect: when `motionPhase` becomes a non-idle value it
samples the motion origin, builds the segment, and starts the controller
**synchronously** in that same turn. There is no deferred-frame window
anywhere: the compositor (§4.5), not a delay, keeps a retarget from reading as
a stall — the previous WAAPI animation carries the visible pixels until the new
one replaces it in the same commit, so even the heaviest rebuild (a
repeated-click profile) never shows on screen.

When a previous segment is still running (repeated click, opposite-direction
click, any interruption), the new segment starts from a **single atomic handoff
point**:

- `startedAt = now()` at the layout-effect turn;
- `controller.captureHandoff(startedAt)` returns one coherent
  `{ position, velocity, strategy, timestamp }` — position and velocity are
  read from the *same* sample of the old curve at the same instant;
- the controller publishes the initial sample of the new segment synchronously.

The controller exposes exactly one handoff API, so position and velocity can
never be sourced from two different moments — the type makes that mistake
unexpressible. `captureHandoff` does not emit, cancel, or notify subscribers;
it is purely the math. `getSnapshot()` is a separate method for cold UI reads
(the last *emitted* visual frame) and must not be used to assemble a handoff.

For a **cold start** from idle the split is different and intentional: the
logical origin position is owned by the reducer (`state.fromVirtualIndex`,
passed in at the dispatch site), and only the residual velocity is read from the
controller's `captureHandoff` — a deliberate cross-layer composition, not a
mixed handoff. A **gesture release** is likewise canonical from the reducer
payload: origin `state.fromVirtualIndex`, velocity `state.gesture.uiVelocity`,
bound to the same END_DRAG event.

Any future change must preserve the invariant: the in-flight handoff is taken as
one atomic `captureHandoff` point — never a position from one moment paired with
a velocity from another.

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

### 4.5 Compositor motion (WAAPI) and the motion plan

The original jank was main-thread contention: writing the track `transform`
from JS on every RAF tick competes with React commits, image decode, and paint,
so a busy frame skips the write and the deck stutters. The fix is to take the
painting off the main thread for EVERY engine-planned motion — only a live
finger drag (and the no-support fallback) stays per-frame.

The bridge is keyframe encoding: an arbitrary accel/cruise/decel profile
cannot be one cubic-bezier, but its temporal shape IS a percent-progress
curve, and a keyframe list reproduces any such curve piecewise-linearly — one
keyframe per uniform time stop, default linear interpolation between them, no
easing function involved. That deliberately avoids the CSS `linear()` easing
(which expresses the same curve but only on 2023+ engines): keyframes run on
ANY engine with `Element.animate` (~2015+). The runner samples the profile
into uniform progress stops (`profileProgressStops`) and hands the same plan
to every paint consumer:

- **Track** — `startCompositorMotion({from, to, duration, stops, startedAt})`:
  one transform keyframe per stop over the segment's pixel distance.
- **Pagination widget** — the plan channel (`motion/planChannel.ts`, exposed on
  the stable module context as `motionPlan`): `{direction, duration, stops,
  startedAt, targetKey, isContinuation}`. The widget folds the stops into its
  keyframed dot trajectories for one step (§8.2), on the same clock.

Because the curve lives in the percent domain, consumers travelling different
distances (N page screens of track pixels vs one dot step) run the identical
temporal shape — synchronized by construction.

The JS controller still runs for **every** segment, composited or not — it
stays the visual-position SSOT for status snapshots, handoff, settle, and the
follow-mode stream. The only thing compositing changes is *who paints*: while a
compositor animation is live, `useTrackBinding.writePosition` suppresses its
own per-frame `transform` write for `source === "frame"` (the subscriber path)
so the JS samples and the WAAPI keyframes do not fight.

Boundaries and guarantees:

- **Eligibility.** Every non-drag, non-instant segment is compositor-eligible.
  The single gate is `Element.animate` itself (`isWaapiSupported`, cached);
  without it the runner publishes a fallback `follow` plan and every consumer
  runs the pre-engine per-frame path — where the track and the widget also
  drop the same Nth running frames (`FALLBACK_WRITE_FRAME_SKIP`, one shared
  constant; the rule is `position/fallbackPacing.ts` evaluated on
  source-numbered frames, so the two can never desynchronize).
- **Graceful fallback.** `startCompositorMotion` returns `false` (and the
  caller falls back to per-frame writes) when there is no measured slot size,
  no `Element.animate`, the input is degenerate (non-finite, zero duration), or
  the engine throws on `animate`. SSR and reduced-motion paths never reach it.
- **Origin coherence.** The animation paints `from` synchronously before
  starting, and its `startTime` is pinned to the segment's own `startedAt`
  clock (the same `performance.now()` origin the JS sampler runs on). The
  compositor therefore traces the segment on the same timeline as the
  controller — a fresh animation is not left play-pending to begin a frame or
  more late under commit/raster load — so a mid-flight handoff pin
  (repeated-click takeover, settle) lands exactly on the painted position
  instead of a phase-shifted one. The widget pins its animations to the same
  clock, keeping deck and widget in phase.
- **Teardown.** `cancelCompositorMotion(position?)` freezes the track at a known
  transform (the explicit reducer/handoff `position`, or a `getComputedStyle`
  read when omitted) and cancels the animation. It is called on idle, on
  drag-takeover (frozen at the live sample so the finger owns the track again),
  on a fallback segment, and on a geometry change (`syncGeometry` re-bases
  the transform math, so any animation keyed off the old baseline is torn down
  and the track re-pinned). The binding also cancels a dangling animation on
  unmount.

This keeps the architecture intact: the motion controller remains DOM-agnostic
and authoritative; track WAAPI lives entirely in `geometry/useTrackBinding.ts`,
widget WAAPI entirely in its binding; the runner computes the math once but
owns no DOM. The compositor is a paint optimization layered under the SSOT,
not a second source of truth.

---

## 5. Gesture model

The shared `usePointerSwipe` hook is a generic horizontal pointer-swipe
primitive (touch-only, configurable, EMA-smoothed velocity with edge
resistance, intent threshold, quick-flick detection, capture / cooldown).
It is not carousel-specific and is reusable.

`useCarouselGesture` is the carousel-specific adapter. It:

1. on press-start for the non-interactive surface, or on horizontal intent for
   an interactive child: records the visually sampled origin position and the
   slot size (`getSlotSize()`), then takes the track **synchronously** —
   `cancelTrackMotion(origin)` tears down any compositor animation and pins the
   track at the live origin, so the finger owns it in the same turn rather than
   after the motion runner's post-commit effect — and publishes the origin into
   the visual stream via `applyTrackPosition` before dispatching `START_DRAG`;
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

The module context is split into **two providers partitioned by update
cadence**, so a high-frequency motion change never re-renders a consumer that
only reads stable data:

```ts
// CarouselStableContext — stable / low-frequency
{
  layout: { pageCount, canSlide, isAtStart, isAtEnd, isTouch,
            isReducedMotion, isDiagnosticActive },
  navigation: { handlePrev, handleNext, handlePageSelect },
  visualPosition: VisualPositionSource | null,  // null when reduced motion
  motionPlan: MotionPlanSource | null,          // engine plan stream (§4.5)
}

// CarouselMotionContext — high-frequency
{
  status: { isIdle, isMoving, isJumping, isDragging, motionPhase },
  intent: { targetPageIndex, moveReason,
            autoplayMotionDuration, autoplayPaginationFactor },
}
```

`navigation` is referentially fixed for the carousel's life and `visualPosition`
changes only when reduced-motion toggles, so the stable value re-identifies only
on a real layout/boundary change — never on an ordinary mid-deck step ("stable"
means rarely, not never). The motion value re-identifies on every
click/gesture/settle. A module reads exactly the half it needs: `<Controls>` and
the widget diagnostic read the **stable half only** (so they do not re-render on
routine steps), while `<Pagination>` /
`<PaginationWidget>` read both (`useCarouselStable` + `useCarouselMotion`) and
re-render on motion transitions, which is their job. Each sub-view (`layoutView`,
`navigationView`, `statusView`, `intentView`) is still memoised independently
inside `useModuleContextValue`, so an unrelated change does not invalidate the
others.

Modules that paint motion do **not** depend on context re-renders for it: the
widget subscribes to `motionPlan` (engine-planned WAAPI steps) and, in follow
mode only, to `visualPosition` (per-frame drag stream) — both are stable
observable objects, so publishing never re-renders React. Modules that only
need the logical view (pagination dots, control availability) read from the
context and re-render at the React tempo.

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

Touch dot pagination. A fixed-width odd-count strip with exponentially
shrinking side dots; `activeDot` overlays carry the moving highlight.

The widget is a **decoupled one-step indicator**: it owns an unbounded step
counter and never mirrors the deck's absolute position — a navigation command
is one step forward or back, whether the deck travels one page or teleports
ten. Its motion follows the engine's plans (§4.5):

- **WAAPI step** (any planned motion): each dot gets a keyframed animation of
  its spatial path across the step (`math/trajectory.ts` samples the
  projection curve at the plan's temporal stops), pinned to the shared
  `startedAt` clock — the same temporal curve the deck runs, over the
  widget's own distance.
  Retargets re-plan from the mid-flight offset (sampled from the plan's
  progress stops, never the DOM); a repeated click advances the step target by
  one; a far GO_TO is one step spanning the whole preflight + approach
  duration (the approach plan arrives flagged `isContinuation` and is
  ignored).
- **Follow mode** (finger on the deck, or the no-WAAPI fallback): per-frame
  writes from the `visualPosition` stream, delta-based in the widget's own
  step domain, with epsilon write gates. In the fallback flavour each Nth
  running frame is dropped via the shared pacing rule — the same frames the
  track drops — since the fallback stream carries every motion, not just a
  short drag.

When reduced motion is on, the widget falls back to a static React-rendered
strip reflecting the logical target.

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

The carousel ships as a box with two sibling halves:

```
src/components/Carousel/           THE BOX
├── README.md                      maps the two halves
├── client/                        ← this document's subject (goes in the app)
└── data-gen/                      ← Node-only content kit (goes on the server; see its README)
```

`client/` is the browser component; `data-gen/` is the self-contained
content-generation kit (Node-only, imports nothing from `client/`, so it can be
copied to a server on its own and never pulls `node:fs` into the app bundle).
The rest of this graph is `client/`:

```
src/components/Carousel/client/
├── ARCHITECTURE.md                this document
├── Carousel.tsx                   composition root, no business logic
├── Carousel.module.scss
├── index.ts                       public re-exports (component + types + schema)
├── config/                        config resolution
│   ├── defaults.ts                public-prop defaults
│   ├── constants.ts               tunable runtime constants (epsilons, buffers)
│   ├── motion.ts                  profile distance shares (step/autoplay/snap-back/repeated/GO_TO)
│   ├── gesture.ts                 drag config + inertial release config
│   ├── interaction.ts             hover delay, visibility threshold, autoplay pagination factor
│   ├── buildRawConfig.ts          merges raw input with defaults
│   ├── types.ts                   CarouselRuntimeConfig + sub-shapes
│   └── useCarouselConfig.ts
├── context/
│   ├── CarouselModuleContext.ts   stable + motion contexts (split by cadence)
│   ├── CarouselDiagnosticContext.ts  raw props/layout/slots for Diagnostic
│   ├── useDiagnosticContextValue.ts  assembles the diagnostic value (memoised sub-views)
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
│   ├── types.ts                   CarouselSegment (one profile shape), MotionIntent, MotionStart
│   ├── profile.ts                 smoothstep profile (accel/cruise/decel)
│   ├── progressCurve.ts           profile → percent stops (WAAPI keyframe transport); peak solver; WAAPI gate
│   ├── planChannel.ts             engine → paint-consumer motion-plan observable
│   ├── speed.ts                   sameDirectionSpeed, signedVelocity
│   ├── timing.ts                  GO_TO speed + teleport geometry (resolveGoToPlan)
│   ├── duration.ts                duration-authored step duration resolution
│   ├── segmentFactory.ts          builds the Segment for the next motion step
│   ├── sampler.ts                 segment → MotionSampleData at timestamp
│   ├── autoplayDuration.ts        pure autoplay-step duration derivation
│   ├── useMotionRunner.ts         state → segment → controller + WAAPI + plan
│   └── useCarouselMotionExecution.ts  runner + autoplay-duration derivation
├── position/
│   ├── types.ts                   VisualPositionFrame, VisualPositionSource
│   └── useVisualPosition.ts       VisualPositionSource owner
├── geometry/
│   └── useTrackBinding.ts         ResizeObserver + slot measure + transform writer + WAAPI compositor motion
├── gesture/
│   └── useCarouselGesture.ts      pointer-swipe → dispatch + visual position writes
├── autoplay/
│   └── useAutoplay.ts
├── focus/
│   └── useFocusRecovery.ts
├── navigation/
│   └── useCarouselNavigation.ts   public click handlers
├── status/
│   ├── statusSnapshot.ts          onCarouselStatusChange snapshot equality
│   └── useCarouselStatusReporter.ts  deduplicated host status emission
├── slides/
│   ├── SlideItem.tsx
│   ├── SlideItem.types.ts
│   ├── imageResource/             image-resource SSOT (store + React bridge)
│   │   ├── createImageResourceStore.ts  framework-agnostic store
│   │   ├── useImageResource.ts    per-slide useSyncExternalStore binding (store passed in)
│   │   ├── useImageResourceStore.ts   facade: lifecycle + retention in one call
│   │   ├── useImageResourceStoreInstance.ts  lifecycle owner
│   │   ├── useImageResourceRetention.ts  prunes entries + retry timers to the live deck
│   │   └── types.ts
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

1. `types.ts` — public surface.
2. `Carousel.tsx` — top-down composition.
3. `state/types.ts` and `state/reducer.ts` — what the carousel knows
   about itself.
4. `motion/types.ts` and `motion/segmentFactory.ts` — how a logical step
   becomes a visual segment.
5. `position/useVisualPosition.ts` — how the visible position is sampled
   and exposed.
6. `motion/useMotionRunner.ts` — how a state change becomes a controller
   start; the handoff invariant (§4.2).
7. `geometry/useTrackBinding.ts` — how the track DOM is written, and how a
   plain easing step is handed to the compositor (§4.5).
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
- **Compositor track motion is a second paint path, not a second SSOT.** For
  plain easing steps the track translation runs on the compositor thread via
  WAAPI while the JS controller still samples the same curve for every other
  consumer (§4.5). The trade-off is a deliberate, contained duplication: the
  motion is expressed twice — once as JS samples, once as a CSS keyframe pair —
  and the track binding must suppress its per-frame write so the two do not
  fight. The alternative (drive the track from JS like everything else) keeps a
  single expression but puts the heaviest per-frame write back on the main
  thread, where it drops frames under React-commit / image-decode / paint
  contention — the original jank this rework removes. Every engine-planned
  segment is eligible (the profile curve rides stop-encoded keyframes) and
  fallback is total (no `Element.animate`, or any failure, reverts to the
  JS write), so the duplication never becomes a correctness fork: the JS
  controller stays the single authority on where the deck is.
- **Per-instance singletons flow explicitly, not via internal context.** The
  visual position and the image-resource store are both taken as explicit
  dependencies — through props / hook arguments for Carousel internals (e.g.
  the store is passed straight into each `SlideItem`), or through the module
  context value for slot modules. There is no internal carousel-only context
  provider: the data flow is visible in source rather than relying on hidden
  provider scope. (The two React contexts the carousel exposes — the
  cadence-partitioned stable / motion contexts — are the deliberate
  module-boundary API in §7, not an internal wiring shortcut.)
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
  `{ isIdle, currentPageIndex, pageCount }` snapshot. Internal image
  preparation uses the carousel's own idle status directly; the callback is
  purely for application-owned, low-frequency consumers (a page label,
  non-critical work scheduling).
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
- **Public Zod schemas.** Zod is scoped to exactly one job: validating the
  slide-data document (`carousel-slides.json` / an API or CMS payload) before it
  is passed as `slidesData`. `CarouselSlidesDataSchema` is the single public
  entry point; the `Slide`-family schemas it is built from are also the **single
  source of truth** the public `Slide` / `SlideImageVariants` / `SlideImageSource`
  types are inferred from (`z.infer`), so the validated shape and the type cannot
  drift. There are **no** prop/callback schemas — props are not validated. The
  schemas are exported only from `contract/schemas` and deliberately **not**
  re-exported from the contract barrel or the component entry: a value re-export
  on the runtime import path would pull Zod into the app bundle, so hosts opt in
  with an explicit deep import
  (`import { CarouselSlidesDataSchema } from ".../client/contract/schemas"`).
  The component itself does **not** runtime-validate: invalid input propagates
  and is surfaced by the `Diagnostic` slot as DEV-only warnings, keeping the
  failure mode visible at the source.
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
- **Performance.** Every engine-planned motion — click, autoplay, snap-back,
  gesture release, repeated click, every GO_TO slice — runs on the compositor
  thread via WAAPI with the profile stop-encoded into keyframes (§4.5): the
  engine computes the math once per motion (profile + 32 progress stops +
  keyframes) and no per-frame JS work happens while it plays, for the track OR
  the pagination widget. Per-frame writes remain only for the finger-drag
  follow mode and the no-WAAPI fallback (where both consumers drop the same
  Nth running frames via the shared pacing rule), and the track binding
  short-circuits
  writes that would re-apply the same transform and the widget binding
  short-circuits per dot against numeric position / scale / opacity epsilons
  (`PaginationWidget/defaults.ts`). The motion
  controller emits only on actual sample change (per RAF tick of an active
  segment; one synchronous emit on segment start; no emits while idle). Image
  prioritization is delegated to native `<img>` hints, and the pre-mounted
  render-window buffer has every reachable slide fetching while idle, so no
  speculative warm-up machinery runs at all.
