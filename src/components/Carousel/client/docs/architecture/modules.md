# Slot modules

Modules attach via the `slot` static convention (see
[motion.md § Module synchronisation](./motion.md)). Each reads only the context
half it needs.

## `<Pagination />`

Desktop dot pagination — one `PaginationDot` per page. Reads
`intent.targetPageIndex` + `layout.pageCount` and `motionPlan` from the stable
half; a click dispatches `navigation.handlePageSelect(pageIndex)` as `GO_TO`.

The active dot is the **third consumer of the motion plan** (track = pixels,
widget = dot steps, pagination = opacity). React flips the target dot active
immediately; `usePaginationFade` masks the flip with two WAAPI animations
(outgoing → resting, incoming → active) built by `buildFadeKeyframes` from the
plan's percent-progress stops, over the plan's duration, pinned to its
`startedAt` clock — the dot decelerates exactly with the deck. Dot looks are
CSS-owned: the fade reads the same three custom properties
(`--pagination-dot-opacity`, `--pagination-dot-opacity-active`,
`--pagination-dot-scale-active`) the classes use, so fade and resting styles
cannot disagree. A mid-fade retarget continues from the **painted** values (read
before `cancel()` drops the fill); far-`GO_TO` approach slices (`isContinuation`)
are ignored. Non-planned changes (drag flips, reduced motion, no-WAAPI fallback)
fall back to the plain CSS transition.

The wrapper is `aria-hidden="true"` — dots are pointer targets, not exposed to
AT; page indication reaches screen readers via `aria-current="step"` on the
visible band. The slot renders only when `canSlide` (`shouldRenderPagination`),
so a single-page deck shows no dots — no internal `pageCount <= 1` guard.

**Transition suppression (a load-bearing trap).** The dot's CSS `transition`
covers opacity and transform — the very two properties the fade animations drive.
Whenever the active-dot class moves, that transition fires, and Blink is left with
two effects on one property; it cannot composite that, so it drops the animation
onto the main thread for the rest of the ride, dragging a full paint lifecycle
through every frame. So `usePaginationFade` sets `transition: none` on each
animated dot for the ride and restores it after — a large measured main-frame
reduction on a weak device. The cascade still picks the animation so the picture
stays correct, which is exactly why the cost is invisible until measured. Do not
remove it. One motion owns the whole strip, so cancellation is collective and the
class styles underneath already hold the animations' end values, so restoring
transitions nothing. Everything is sampled from the plan's own curve, never read
back from the DOM; a dot that would stay invisible for the whole step is left to
its class styles rather than paying for an animation, scanned on the coarse grid
the dot actually rides.

## `<PaginationWidget />`

Touch dot pagination — a fixed-width odd-count strip with exponentially
shrinking side dots; `activeDot` overlays carry the moving highlight (dot count
via internal `PAGINATION_WIDGET_DEFAULTS`).

It is a **decoupled one-step indicator**: it owns an unbounded step counter and
never mirrors the deck's absolute position — a command is one step forward or
back, whether the deck travels one page or teleports ten. Each step's landing is
resolved by one pure rule (`widget/stepTarget.ts`) over TWO memories — the live
running step (a repeated click retargets mid-animation) and the step a finger
grab tore down. Same `targetKey` → keep the target; same direction → one step
beyond; otherwise plain geometry from the live offset.

- **WAAPI step** (any planned motion): each dot gets a keyframed animation of its
  spatial path (`widget/math/trajectory.ts` samples the projection curve at the
  plan's stops), pinned to the shared `startedAt` clock — the deck's temporal
  curve over the widget's own distance. Retargets re-plan from the mid-flight
  offset (sampled from the plan, never the DOM); a far GO_TO is one step over the
  whole preflight + approach duration (approach arrives `isContinuation`, ignored).
- **Follow mode** (finger on the deck, or no-WAAPI fallback): per-frame writes
  from the `visualPosition` stream, delta-based in the widget's step domain, with
  epsilon write gates. The fallback flavour drops the same Nth frames the track
  does (shared pacing rule).

Reduced motion → a static React-rendered strip reflecting the logical target.
Its own tuning props are audited by `useWidgetDiagnostic` (see
[diagnostics.md](./diagnostics.md)).

## `<Controls />`

Edge navigation zones. Hidden by default on desktop, shown on viewport-hover or
`:focus-visible`; always visible on touch. A zone is not rendered when
`layout.isAtStart` / `isAtEnd` is true (finite mode) — no destination.

## `<ResponsiveImages />`

Headless (renders `null`). Two effects in one slot:

1. **Presence switch.** Mounting it turns the responsive stack on — SlideItem
   emits `<source>` / `srcSet` / `sizes`, the rotation veil arms, the portrait
   aspect flip applies, the image store keys on the canonical `content` URL
   (root `data-responsive-images`; see [viewport.md](./viewport.md),
   [slides.md](./slides.md)). Unmounted: one native set everywhere (the
   designated `image.defaultSrc`, else the widest candidate) and the module's
   code is tree-shaken out. The same slides JSON works both ways.
2. **Predecode manager** (its body). **There is deliberately no preload here.**
   The render window already mounts the buffered slides as real `<img>`s, and
   those elements ARE the preload — they fetch ahead by existing; ordering
   (visible band first) belongs to `useActiveBandGate` ([slides.md](./slides.md)).
   The one thing the markup does not do is DECODE. With `isPredecodeOn`, buffered
   off-band bitmaps (`[data-active-zone="false"] img`) are decoded one at a time
   in idle callbacks, **only while the deck rests**, so the mid-ride
   decode/raster spike that can hold a frame on a weak GPU never happens. The
   file is READ from the element's own `img.currentSrc` (the browser's resolved
   candidate — never a re-derived guess that could diverge from the markup),
   decoded on a **detached** `Image` copy that is then dropped (decoding the
   on-screen element would pin its bitmap for life). It costs no network (the URL
   is already cached). The decode set is pruned to the live buffer, and the queue
   stops the moment the deck moves. `isPredecodeOn` defaults `false` — it trades
   memory pressure for a smoother ride; which side a device wants is not knowable
   here, so measure.

## `<Diagnostic />`

Dev-only, observe-only console emitter — never mounts in production. Full model
in [diagnostics.md](./diagnostics.md).
