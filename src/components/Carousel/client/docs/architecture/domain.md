# Domain

The carousel's pure core: plain functions, no React, no state. Every piece of
geometry and arithmetic the higher layers rely on lives here as a testable
function of its inputs. If a rule can be expressed without a hook or an element,
it belongs in this folder.

One function breaks the purity on purpose: `measureSlotSize` reads the computed
style and box of an element it is handed. The measurement has to happen
somewhere, and putting it here keeps the arithmetic around it — gap fallbacks,
the divide, the degenerate cases — testable. Who calls it, and how often, is
owned by `geometry/useSlotSizeSource.ts`: the read forces layout.

Two coordinate systems run through the domain:

- **page index** — which page the deck is on, `[0, pageCount)`.
- **virtual index** — a slide's absolute position along the (possibly cyclic)
  strip, in slot units. The visible track offset is a virtual index.

A carousel is either **finite** (real first/last page, indexes clamp) or
**cyclic** (indexes wrap via modulo). Almost every function below branches on
`layout.isFinite`, and the two branches are the whole difference between a
bounded slider and an infinite loop.

## Math

The primitives: `clamp`, `mod` (a floor-modulo that stays non-negative and
returns 0 for a non-positive divisor), and `normalizePageIndex` (wrap a page
into `[0, pageCount)`). Everything cyclic is built on `mod`.

## Layout

`buildCarouselLayout` turns the slide records plus `visibleSlidesCount` and the
finite flag into the `CarouselLayout` fact object every other layer reads:
`length`, effective `visibleSlidesCount` (clamped to the deck length), page
count, virtual length, `canSlide`, and `dataKey`. The page arithmetic lives
alongside it:

- `pageStart` / `pageContaining` (floor-based) / `nearestPageIndex` (round-based
  — the contrast matters: one asks which page a position is IN, the other which
  page it is CLOSEST to).
- `alignedVirtualIndex` — the virtual index for a page on the same cyclic lane as
  a reference index, so a cyclic jump takes the nearest instance of the target
  page rather than snapping across the whole strip.
- `carouselBoundaryState` — `isAtStart` / `isAtEnd`, always false in cyclic mode.
- `reconciledPageIndex` — maps the current page proportionally onto a new layout
  when the deck resizes (used by state reconciliation).

`dataKey` is a one-pass string identifying the whole record sequence (built
straight into the result, no intermediate array — one fewer allocation per layout
build). It pins `length` and, with `visibleSlidesCount`, fully determines the
derived facts, so state reconciliation compares it instead of the records.

## Slide records and image resolution

`buildSlideRecords` wraps the raw slides with a stable per-slide key.
`padDeckToFullPage` appends head clones so the length is a multiple of
`visibleSlidesCount`, keeping the last page from being visually short when full
pages are requested.

The image resolvers decide which URL a slide actually renders — one rule shared
by the slide renderer and the image-resource store so they can never key on
different URLs:

- `resolveLargestSrcSetCandidate` / `resolveLargestImageCandidate` pick the
  widest `w`-descriptor candidate across a slide's default `srcSet` and every
  art-directed `<source>`. Width is the only size signal the data carries, so
  width is the whole rule; exact ties keep the default srcSet, then earlier
  source order — deterministic and semantics-free.
- `resolveRenderedImageSrc` is the shared entry point: in responsive mode the
  canonical `content` URL (the browser upgrades it via `srcSet`); in single-set
  mode the publisher's designated `image.defaultSrc`, else the widest candidate,
  else `content`.

## Drag release

`resolveDragRelease` decides the page target when a finger lifts. A directional
release commits ±1 page (or snaps back at a boundary). A directionless release
resolves two different ways, and conflating them is the trap this function
exists to prevent:

- **from rest** — geometry decides: snap to the page nearest the released
  position.
- **on an in-flight grab** (the finger caught a moving ride) — settle by the
  ride's intent, onto the PRESSED page, falling back to the interrupted ride's
  destination. Judging a ride-produced position geometrically would discard a
  committed navigation and hide the slide that was entering.

The returned `isSnap` flag marks a passive snap (no real navigation) so the
runner can pick a snap-back curve. `DRAG_RELEASE_EPSILON` is a float-noise
absorber for the release-position compare — an implementation constant, not a
feel knob, hence it lives here rather than in config.

## Track transforms and lanes

The functions that turn a virtual position into CSS. `trackPixelTransform` is the
`translate3d` scroll once a pixel slot size is measured; `trackCssTransform` is
the `calc(...)` fallback before that. Both take a `layoutOrigin` that is
DELIBERATELY not the render-window start — the origin is stable across window
shifts, so the transform re-baselines only on a rare recenter and a window shift
never moves a slide relative to the track (no re-raster).

`slideLane` is the one per-slide datum handed to CSS (`--slide-lane`): SCSS owns
the rule, JS owns only the number. `measureSlotSize` reads the slot width from
the viewport and its gap variable; `pointerVelocityToVirtual` converts pointer
pixel velocity into virtual-index-per-ms (negative, because moving the pointer
right lowers the virtual index).

## Render window

`buildRenderWindow` is the buffered range of slides to mount around a motion
segment — the segment's own span plus a buffer on each side. `buildSegmentWindow`
is the minimum window with no buffer, used to check whether a previously-set
buffered window still covers an ongoing motion; `windowContains` / `expandWindow`
are the set helpers. In finite mode the window clamps to the deck; in cyclic mode
it runs unbounded and the renderer maps indexes back with `loopedSlideIndex`.

## Visibility

`slideVisibilityFlags` computes a slide's `isActual` ("inside the visible band
right now") and `isActive` ("also counts as visible during motion" — the band is
extended to include slides that were visible at the segment start, so they stay
interactive through the transition). `buildSlideAriaProps` produces the slide's
group/label ARIA, stamping `aria-current` only on the actual band.
