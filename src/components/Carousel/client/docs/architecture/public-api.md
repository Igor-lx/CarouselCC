# Public API — the product contract

The host-facing surface: what you import, the props, the slot children, the DOM
contract, and the slide data shape. Mechanism lives in the area docs
([motion](./motion.md), [gesture](./gesture.md), [slides](./slides.md),
[modules](./modules.md)); this document is the contract.

## Import

```tsx
import Carousel, { type Slide, type CarouselProps } from "./Carousel";
import { Pagination, PaginationWidget } from "./Carousel/modules/Pagination";
import { Controls } from "./Carousel/modules/Controls";
import { ResponsiveImages } from "./Carousel/modules/ResponsiveImages";
import { Diagnostic } from "./Carousel/modules/Diagnostic";
```

The default export is the deck. `Pagination` and `PaginationWidget` are two
exports of the same `modules/Pagination` folder (basic dots vs the touch strip);
the rest are one folder each. Modules attach via the `slot` static convention.

## Minimal usage

```tsx
<Carousel slidesData={slides}>
  <Pagination />
  <Controls />
</Carousel>
```

With overrides and an injected environment:

```tsx
const userEnvironment = useUserEnvironment(); // the project's shared hook

<Carousel
  slidesData={slides}
  isAutoplayOn
  isFullPagesOn
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

## Props

All props are optional except `slidesData`. Defaults are substituted only for
`undefined` props; other values pass through unchanged. Invalid input is
surfaced by the `Diagnostic` slot but never repaired — see
[ADR-002](../adr/0002-trusted-runtime-inputs.md).

### Slides

| Prop | Type | Effect |
| --- | --- | --- |
| `slidesData` | `Slide[]` | **Required.** `content` (a trimmed-non-empty string, number, or React element) is the slide's **identity** — it alone with `id` feeds `dataKey`. `image` is optional render-only responsive variants (below). |
| `visibleSlidesNr` | `number` | Slides sharing the viewport. Drives lane width, slot measurement, `pageCount = ceil(length / visibleSlidesNr)`, and the widget projection. |
| `isFullPagesOn` | `boolean` | Repeats slides from the HEAD of the deck so the last page is never partial (see [slides.md](./slides.md)). The clones carry the same data under a distinct key, so they are extra lanes, not extra slides. |
| `isContentImg` | `boolean` | Treats string `content` as an `<img src>`; errors fall back to `alt` / `errAltPlaceholder`. |
| `errAltPlaceholder` | `string` | Placeholder text when an image fails and the slide has no `alt`. |

### Layout / motion mode

| Prop | Type | Effect |
| --- | --- | --- |
| `isFinite` | `boolean` | On: track stops at boundaries (`isAtStart`/`isAtEnd` flag edges). Off: cyclic; the wrap belongs to ±1 steps, while `GO_TO` travels in dot-scale direction. |

### User environment

The carousel does **not** detect the environment — it is a pure function of its
props. The host injects it via one optional object (recommended source: the
project's shared `useUserEnvironment` hook, which returns a referentially
stable object).

| Prop | Type | Effect |
| --- | --- | --- |
| `userEnvironment` | `{ reducedMotion?, touch?, dataSaver? }` | `reducedMotion`: transitions snap, gesture off, widget static. `touch`: gesture eligibility, `data-touch`, autoplay hover-pause exemption. `dataSaver`: off-band images load lazily at low priority. An unset field resolves to `false`; the omission is reported by Diagnostic, never silently repaired. |

### Motion timing

| Prop | Effect |
| --- | --- |
| `durationAutoplay` | Duration of an autoplay page step. |
| `intervalAutoplay` | Idle interval between autoplay steps. |
| `durationStep` | Base duration of duration-authored click / gesture steps; multi-page click distances scale linearly. Repeated-click segments derive duration from their speed profile instead. |

### Module gates

| Prop | Effect |
| --- | --- |
| `isAutoplayOn` | Master autoplay switch. Auto-pauses when the viewport is under `PAUSE_VISIBILITY_RATIO` on screen, during drag/motion, or (desktop) on hover (`PAUSE_HOVER_DELAY_MS`). Loops to the first page via `GO_TO` at the finite end. |
| `isPaginationOn` | Gates the attached `Pagination` / `PaginationWidget` slot. `true` with no slot attached renders nothing — the slot must opt in via `children`. |
| `isControlsOn` | Same contract, for `Controls`. |
| `isSwipeOn` | Master gesture switch. Off attaches **no listeners at all**. Flipped off under a live finger, the orphaned drag ends as a passive snap ([gesture.md](./gesture.md)). Not a render gate — gesture has no slot. |
| `isSlideInteractiveOn` | On: a slide whose image loaded and that has `onSlideClick` renders as a `<button>`. |
| `isPaginationInteractiveOn` | Same rule for `<Pagination>` dots (pointer affordance only; dots are `aria-hidden`/unfocusable either way). Honoured verbatim — a host wanting dots inert under touch passes `!isTouch` itself. |

### Callbacks and handle

| Prop | Type | Effect |
| --- | --- | --- |
| `onSlideClick` | `(slide: Slide) => void` | Fires on an interactive slide click. |
| `onCarouselStatusChange` | `(snapshot: CarouselStatusSnapshot) => void` | Low-frequency, **observation-only**: `{ isIdle, currentPageIndex, pageCount, isAtStart, isAtEnd }`. `currentPageIndex` is the *target* page (reflects intent immediately). No per-frame data, no reducer internals; deduped by shallow compare. |
| `ref` | `Ref<CarouselHandle>` | `{ prev(): void; next(): void }`. Single-step navigation routed through the same pipeline as `<Controls>`; a safe no-op when the deck cannot slide. `GO_TO` is deliberately not exposed. |

### Styling

| Prop | Type | Effect |
| --- | --- | --- |
| `className` | `ClassNameMap` | Partial map keyed by `outerContainer`, `innerContainer`, `slideContainer`, `slide`, `slideInteractive`, `slideError`, `slideText`. Merged via `mergeStyleMaps`; unset keys keep the built-in styles. |

## Validating slide data

`Slide`, `SlideImageVariants` and `SlideImageSource` are inferred (`z.infer`)
from Zod schemas in `public-api/schemas.ts`, so the validated shape and the
compile-time type cannot drift. A host may validate external slide data (an API
response, a CMS payload, the generated JSON) against `CarouselSlidesDataSchema`
before passing it as `slidesData` — the only thing Zod is used for here; the
carousel never runtime-validates its own props (invalid input surfaces through
the Diagnostic slot, never repaired — [ADR-002](../adr/0002-trusted-runtime-inputs.md)).

Importing a TYPE from the contract is erased; importing a SCHEMA pulls in Zod.
So `schemas.ts` is deliberately NOT re-exported from the barrel or the entry —
that keeps Zod out of the app bundle. Hosts opt in with an explicit deep import
(`.../public-api/schemas`). String fields are trimmed and non-empty, so an empty
`media`/`srcSet` is rejected at the host boundary rather than emitted as a dead
`<source>`.

## Slot children

`children` accepts module elements identified by a `slot` static:

| Slot | Component | Notes |
| --- | --- | --- |
| `pagination` | `<Pagination />` or `<PaginationWidget />` | Exactly one. Renders only when `isPaginationOn`. |
| `controls` | `<Controls />` | Renders only when `isControlsOn`. |
| `responsive-images` | `<ResponsiveImages />` | Headless. Its PRESENCE switches the responsive stack on; its body is the predecode manager (no preload — the render window is the preload). Absent: one native set everywhere. See [modules.md](./modules.md). |
| `diagnostic` | `<Diagnostic />` | Dev-only observer — never mounts in production (attachment is gated on `IS_DEV`). See [diagnostics.md](./diagnostics.md). |

Resolution is by the shared `resolveSlots` against `CAROUSEL_SLOTS`. Non-tagged
children are dropped (with a dev warning when a Diagnostic slot is present).

## What the host owns: prop identity

The component is memoised behind `areCarouselPropsEqual`, which compares every
prop by identity and only `children` structurally. That makes referential
stability part of the contract rather than an optimisation detail:

| Prop | If a fresh value arrives every host render |
| --- | --- |
| `slidesData` | records, layout and `dataKey` are rebuilt, and an unchanged deck still reconciles |
| `className` | the merged class map and every slide's class prop re-identify |
| `userEnvironment` | reduced-motion / touch / data-saver are re-read and the context half that carries them re-identifies |
| `onSlideClick`, `onCarouselStatusChange` | the navigation view re-identifies, and the status reporter re-runs its effect |

None of this is a crash — it is the deck reconciling for a reason that has
nothing to do with the deck. Hold these five in `useMemo` / `useCallback` (or as
module constants), exactly as the recommended `useUserEnvironment` hook already
does for its own result.

Slot children are the deliberate exception: inline JSX is a fresh object every
render, which is why the comparator walks them structurally instead.

## DOM contract

```html
<div role="region" aria-roledescription="carousel"
     data-carousel-root data-touch data-reduced-motion>
  <div data-carousel-viewport tabindex="-1">
    <div data-carousel-track><!-- one element per virtual slide --></div>
    <!-- controls slot -->
  </div>
  <!-- pagination slot --><!-- diagnostic slot -->
</div>
```

Stable hooks for external code: `[data-carousel-root]`,
`[data-carousel-viewport]`, `[data-carousel-track]` (the animated element),
`data-touch` / `data-reduced-motion` (mirror `userEnvironment`), and `[inert]`
on out-of-band slides. The root also stamps `data-breakpoint` /
`data-orientation` / `data-<flag>` (see [viewport.md](./viewport.md)).

## Slide data and responsive images

`content` is identity and doubles as the fallback `<img src>`. Responsive
variants ride separately in an optional **render-only** `image` object, so the
browser can pick a per-resolution / per-orientation asset without ever changing
identity:

```ts
interface SlideImageSource {
  media: string;   // a canonical axis string — see viewport.md
  srcSet: string;  // width-descriptor candidates ("<url> <width>w, …")
  sizes?: string;  // defaults to the carousel's auto value
  type?: string;
}
interface SlideImageVariants {
  srcSet?: string;              // candidates for the default <img>
  sizes?: string;               // override the auto value (rare)
  sources?: SlideImageSource[]; // art-directed <source> overrides
  defaultSrc?: string;          // the single-set asset when responsive is off
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
  reconciliation — adding/removing/swapping variants (including an orientation
  crop on rotation) never resets the viewing position. Keep `content` stable
  across orientations; vary only `image`.
- **`sizes` is carousel-supplied** — a default derived from `visibleSlidesNr`
  (about one slide's share of the viewport width) on the `<img>` and each
  `<source>`, avoiding the "no `sizes` → oversized candidate" trap. A slide's own
  `image.sizes` / `source.sizes` overrides it.
- **`<source>` is for exceptions, `<img>` is the default.** With `image.sources`
  present the slide renders a `<picture>`; place normal candidates in
  `image.srcSet`, reserve `sources` for art-directed crops. `<source media>`
  strings should be canonical axis strings (see [viewport.md](./viewport.md)).

Responsive rendering only happens when `<ResponsiveImages />` is mounted;
otherwise a slide is a plain `<img>` of `image.defaultSrc` (else the widest
candidate). The same slides JSON works both ways.

## Where the tunable values live

This documentation deliberately does not enumerate constant values — durations,
multipliers, distance shares, epsilons, dot counts, thresholds are feel/tuning
and change often, so restating them only invites drift. The single source is
`config/` (and the widget's own defaults):

- [`config/defaults.ts`](../../config/defaults.ts) — public-prop defaults.
- [`config/motion.ts`](../../config/motion.ts) — profile distance shares + GO_TO
  teleport geometry (`GO_TO_TELEPORT_MIN_PAGE_SPAN` and the spans; diagnostics
  enforce their relation).
- [`config/gesture.ts`](../../config/gesture.ts) — swipe + inertial-release
  config and the slot-adaptive constants ([gesture.md](./gesture.md)).
- [`config/interaction.ts`](../../config/interaction.ts) — hover delay,
  visibility threshold.
- [`config/layout.ts`](../../config/layout.ts) — render-window buffer;
  [`config/legacyPaint.ts`](../../config/legacyPaint.ts) — no-WAAPI frame cadence.
- [`modules/Pagination/widget/defaults.ts`](../../modules/Pagination/widget/defaults.ts)
  — widget geometry + write epsilons.

These values are part of the visual contract; the `Diagnostic` slot
range-checks them (dev-only). This doc describes *what* each governs — the value
is read from `config/`.

## Behavioural guarantees

The user-facing behaviours (step semantics, repeated-click, GO_TO, drag,
autoplay, errors, focus) are specified in the area docs: navigation and motion in
[motion.md](./motion.md), touch in [gesture.md](./gesture.md), image/lifecycle in
[slides.md](./slides.md), per-module behaviour in [modules.md](./modules.md).
