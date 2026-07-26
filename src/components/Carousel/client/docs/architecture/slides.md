# Slides

How individual slides are built, mounted, prioritized, rendered, and recovered.
The viewport axes that drive asset choice are in [viewport.md](./viewport.md);
the paint-cost decoupling of slide lanes is in [motion.md](./motion.md).

## Records and perfect-page extension

[`domain/slides.ts`](../../domain/slides.ts) builds slide records from
`slidesData`. `clampedVisibleSlidesCount = min(visibleSlidesCount, length)` is
the load-bearing coercion that keeps the visible band from exceeding the deck; it
is intentionally silent but now **observable** — Diagnostic reports a
`visibleSlidesNr > deck length` misconfiguration (see
[diagnostics.md](./diagnostics.md)).

With `isFullPagesOn`, `padDeckToFullPage` clones head slides so the length is a
multiple of `visibleSlidesCount` and the last page is not visually short. Clones
carry a distinct `slideKey` but the same content.

## Render window and mounting

[`slides/useSlideRenderModel.ts`](../../slides/useSlideRenderModel.ts) decides
which virtual slides are MOUNTED. The window **expands during motion and shrinks
on settle**, persisted across renders so a slide is never unmounted mid-flight.
Its buffer (`RENDER_WINDOW_BUFFER_MULTIPLIER`) covers the full span a single
click or a repeated-click lookahead can reveal, so every reachable slide is
mounted while idle and its `<img>` fetches long before motion starts — this is
why there is no separate predecode machinery.

The window rides on a STABLE `layoutOrigin` that recenters only after a whole
band of one-way drift (`LAYOUT_ORIGIN_BAND_SLOTS`), so a per-settle window shift
mounts one edge slide and unmounts another and moves no other slide. The lane
math is in [motion.md](./motion.md).

## Two-wave fetch (the active band gate)

[`slides/useActiveBandGate.ts`](../../slides/useActiveBandGate.ts): the buffer's
off-band `<img>`s do not fetch until the visible band has reported an outcome.
`fetchpriority` cannot fix in-band starvation — priority orders a queue, but with
a handful of parallel requests against six connections nothing queues; they share
the pipe evenly and the looked-at slide waits behind slides nobody asked for. The
gate splits the fetch into two waves: visible band first, buffer right behind.
Nothing loads faster in total; only the order changes.

The gate opens on "reported an outcome at least once" (success OR error, latched
per URL), not "loaded" — a broken image cycling `loading → error → loading` would
otherwise reopen and shut the gate on every retry. There is deliberately no
timeout fuse: `isActual` follows the target page, so a slide ridden to joins the
band and gets its source in the frame the ride commits.

## Rendering a slide

[`slides/SlideItem.tsx`](../../slides/SlideItem.tsx) renders one slide against an
externally derived active band (`isActive` / `isActual`):

- **Image content is governed by the image-resource SSOT** — the slide keeps no
  private load/error state. It renders the `<img>` while the resource is
  `loading`/`loaded`, reports the element's real outcome back to the store, and
  falls back to a text placeholder (`alt`, else `errAltPlaceholder`) on `error`.
- **Interactivity**: a slide is a `<button>` only when configured interactive, an
  `onSlideClick` was provided, and — for image slides — the image actually loaded.
  Otherwise a `<div>`. Slides outside the active visual band are `inert`.
- **Prioritization** is native, on the rendered element: the active band fetches
  eagerly at high `fetchpriority`; off-band falls back to default, or — under
  `userEnvironment.dataSaver` — loads lazily at low priority.
- **Responsive rendering** (when the `<ResponsiveImages />` module is mounted —
  see [modules.md](./modules.md)): `image.srcSet` → the default `<img>`, and
  `image.sources` → a `<picture>` of art-directed `<source>`s. The carousel
  injects a default `sizes` derived from `visibleSlidesNr`, overridable per
  slide. The `Slide.image` data shape is in [public-api.md](./public-api.md).

## Image resources: status, error, retry

The per-carousel store
([`slides/imageResource/createImageResourceStore.ts`](../../slides/imageResource/createImageResourceStore.ts))
is the SSOT for renderability — one entry per URL: render `status`
(`loading | loaded | error`) + a retry `generation`, with one capped,
backed-off retry timer per URL. Slides subscribe via `useImageResource` and
report the real `<img>` outcome back (`reportLoaded` / `reportError`,
authoritative). "Has this slide's image failed" is a derived read, never a second
copy. A successful retry remounts the `<img>` and restores the slide. The store
is observation-only — it never feeds navigation, layout, or motion. Retention
prunes entries and timers to the live deck.

## Orientation swap veil

[`slides/useOrientationSwapVeil.ts`](../../slides/useOrientationSwapVeil.ts)
masks one repaint race, and only that: on rotation the slide box flips aspect
instantly and the browser re-selects the `<source media>` crop, but keeps
painting the OLD bitmap (a zoomed centre under `object-fit: cover`) until the new
crop decodes. When the orientation condition flips while a bitmap is on screen
the image is veiled (CSS fade via `data-reorienting`) and unveiled the moment the
new bitmap is decodable (`img.decode()`, self-regulating: instant on cache, held
as long as needed on a slow device; `SLIDE_REORIENT_VEIL.veilMaxMs` is the
fail-open cap). This is deliberately a VIEW concern (paint masking on a healthy
resource), not an image-resource-store concern (URL load/error lifecycle).

## Focus recovery

When the carousel settles, if focus sits inside a now-`inert` out-of-band slide,
[`focus/useFocusRecovery.ts`](../../focus/useFocusRecovery.ts) moves it to the
first focusable target in the new active band (`manageFocusShift`). No-op when
nothing inside the deck is focused.
