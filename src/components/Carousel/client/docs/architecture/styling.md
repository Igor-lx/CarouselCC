# Styling

The stylesheet side of the component: the `*.module.scss` files, what the CSS
rules mean, and the rendering traps behind the non-obvious ones. The JS half of
the same contract — which custom properties JS publishes and why — is in
[presentation.md](./presentation.md); how the viewport axes become data
attributes is in [viewport.md](./viewport.md).

## The division of labour

**JS hands over data, the stylesheet owns the rules.** The component SCSS
contains no media queries and no breakpoint numbers. Layout/animation rules live
here; JS publishes only the few values CSS cannot know — `--slide-lane`,
`--visible-slides`, the veil fade timings (bound to a JS invariant, so sourced
from config), and the widget's `--dot-active-strength`. A host can restyle any
state through `className` without touching component code.

Per-viewport styling is keyed on the root's own data attributes
(`data-breakpoint`, `data-orientation`, `data-<flag>`), never on `@media`. This
is the CSS twin of the `useMedia` contract: the tier is a single attribute value,
so tiers are mutually exclusive, and the plain-tier rules exclude the
`short-landscape` flag — so at most one block ever matches a viewport and the
blocks are **order-independent** (reorder freely, the matching one still wins). A
raw `@media (width <= 1024px)` was also off-by-one against the tier boundary;
keying on the tier removes the whole class of drift. Diagnostics cross-checks
every state name used in CSS against the config axes — a typo is a silently dead
block (see [diagnostics.md](./diagnostics.md)).

The one deliberate exception is a **widget-private** `@media` sub-threshold: the
strip tightens its padding below a width that drives neither art direction nor
slide geometry, so it has no counterpart in the shared axes and stays a raw
query, split by width from its sibling so the two are mutually exclusive.

## Slide geometry

Three public tuning variables shape the slide, all restylable, none contracted
against the assets:

- **`--slide-aspect`** shapes the slide BOX (height as a function of the computed
  width) — it is not "the aspect of your images" and need not match them; the
  image fits the box per `--slide-image-fit` (`object-fit`, crops or letterboxes
  as anywhere). A box needs some height before any image bytes arrive.
- **`--slide-height`** pins a length instead of the ratio (`auto` keeps it
  fluid). The slide AND the invisible height sizer both read it, so they stay in
  sync. Width stays fluid and the motion math is width-based, so a fixed height
  never affects scrolling.
- **`--slide-image-fit`** is how the image fills the box — a taste knob.

The **height sizer** is the only in-flow child; its aspect-ratio (or the height
override) gives the otherwise-collapsed track its height. It MUST read the same
height source as the slide, or the two desync. The real slides are absolutely
positioned over it.

## Layout traps

- **Measurement contract.** The track and the viewport above it must carry NO
  border and NO padding. Slide widths resolve their percentage against the
  content box while the JS slot math reads the viewport's `offsetWidth` (border
  box); any border/padding makes the real slide step smaller than the transform
  step, so motion overshoots by a couple of pixels and jerks back on settle.
- **Stable lanes.** Slides are absolutely positioned by their own virtual lane
  (`--slide-lane`), not laid out in flow. Only the track's `transform` scrolls,
  so a render-window shift mounts/unmounts an edge slide without moving any other
  slide and the compositor never re-rasters the whole track on settle. One lane
  step is the slide's own width plus a gap — exactly one slot stride, because
  `translateX(100%)` on an absolutely-positioned box resolves against its OWN
  width — so the gap is baked into the stride and the track needs no flex `gap`.
- **Inset outline, not border.** The slide frame (hover / error / text) is an
  outline drawn just inside the box. The outer slides sit flush against the
  viewport's overflow clip, so an edge border lands on the clip boundary and
  sub-pixel rounding shaves it (bottom row, first slide's left edge, radius
  corners). An inset outline is clip-immune, follows the radius, paints above the
  image (outlines are the last paint phase), and never shifts layout.
- **`<picture>` uses `display: contents`.** With a real box between the slide and
  the `img`, the img's percentage height has nothing definite to resolve against
  and falls back to the intrinsic ratio, overflowing the slide. `display:
  contents` makes the slide itself the img's containing block.
- **Icon SVGs need an explicit size.** The control icons carry only a `viewBox`;
  Safari collapses an unsized inline SVG to 0×0, so the `100%` sizing is required.

## Compositor traps (do not remove)

Two effects on one property is the recurring hazard: Blink cannot composite a
property driven by both a CSS `transition` and a WAAPI animation, so it drops the
whole animation onto the main thread for the ride — a large measured regression
in exactly the frames the deck can least afford it.

- **Pagination dots and slide outline suppress their transition for the ride.**
  The dot's `transition` covers opacity/transform (the two properties the fade
  drives), and the slide outline transitions `outline-color` (which is not
  compositable and would restart a 600 ms main-thread transition on every
  hover handover as the strip sweeps under a resting cursor). Both are suppressed
  for the ride — `usePaginationFade` per dot, the `[data-moving]` rule for the
  slide — and restored at rest, where the fade is the only time it is looked at.
  See the JS side in [modules.md](./modules.md).
- **Dots keep a permanent compositor layer** (`will-change`). The cross-fade
  animates them there anyway; toggling between in-flow antialiased rendering and
  layer rasterization makes a dot visibly "fatten" for each animation and snap
  back on finish. One constant rendering mode, no jump; the tiny layers cost
  nothing. The dot cross-fade and the resting classes read the SAME three custom
  properties, so the animation and the resting look can never disagree.

## Reveal transitions

The slide image has two fade sources, both timed off the same "image appears"
durations rather than a second knob (see [slides.md](./slides.md)):

- **Orientation-swap veil** (`data-reorienting`): masks the window where the box
  already flipped aspect but the old crop is still painted. CSS transitions take
  the DESTINATION state's timing, so the base rule governs fade-in (attribute
  removed) and the `[data-reorienting]` rule fade-out (attribute added). Cached
  swaps clear before the fade is visible; under reduced motion it is an instant
  blink.
- **Slow-load reveal** (`data-awaiting-image`, ResponsiveImages module only):
  a network image paints progressively (stripes crawling top-to-bottom), so it is
  hidden instantly (`transition: none` — no fade TO invisible) and the finished
  bitmap fades in when the attribute drops.

## Chrome-clearance details

- Pagination dots keep a small bottom clearance: during the WAAPI cross-fade a
  dot is rasterized on a layer whose sub-pixel rounding differs from the in-flow
  render, and flush content gets its bottom sliver clipped for the animation.
- The Controls hover-reveal is scoped to the viewport (`[data-carousel-viewport]:hover
  / :has(*:focus-visible)`), not a root-level `:has()`, which is cheaper for the
  style engine to invalidate. The pointer affordance lives on `.dotInteractive` /
  the touch zone, applied only when interactive; the base dot is an inert `<div>`
  the wrapper's `pointer-events: none` leaves alone.
