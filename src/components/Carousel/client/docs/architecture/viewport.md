# Viewport model

How the deck resolves the current viewport into a styling state and an asset
choice. Slide rendering itself (the `<img>`/`<picture>`, prioritization, errors)
is in [slides.md](./slides.md); the `Slide.image` data shape is in
[public-api.md](./public-api.md).

## The axes are the single source

[`config/viewport.ts`](../../config/viewport.ts) is the ONE place breakpoint
names/numbers and flag conditions are defined. Everything else derives from it —
all of it carousel-owned tuning, nothing from the host.

- **`SLIDE_VIEWPORT_BREAKPOINTS`** — width tiers as `name: minWidthPx`. Names
  are arbitrary: resolution is purely by NUMBER (largest matching threshold
  wins), so naming/order can never shadow a wider tier. A zero-width tier is the
  always-matching fallback.
- **`SLIDE_VIEWPORT_FLAGS`** — arbitrary named boolean viewport conditions →
  `data-<name>`. Each condition is written literally here, deliberately NOT
  imported from a shared media primitive, so the component owns it.
- **`SLIDE_VIEWPORT_BASE_BREAKPOINT`** — names the base tier (styled by the
  plain rule, not a `[data-breakpoint]` block). A STYLING fact, not derivable
  from the table: a widest-tier-first stylesheet makes its base the WIDEST tier
  while the resolver's fallback is the NARROWEST. Diagnostics reads it to know
  that tier styling nothing by attribute is intended, not a forgotten block.

## Resolution → data attributes → CSS

[`viewport/useSlideViewport.ts`](../../viewport/useSlideViewport.ts) is one
`useMedia(SLIDE_VIEWPORT_AXES)` call over the shared media store (one browser
listener per distinct condition, no matter how many consumers). Its result is
stamped by the root as **data attributes**: `data-breakpoint`,
`data-orientation`, and `data-<flag>` for each flag.

The component SCSS styles slide geometry **by those attributes** — the
stylesheet holds NO media queries and NO numbers. This is the attribute-driven
SSOT: the numbers live once in `config/viewport.ts`, JS resolves them, CSS keys
on the stamped state. A host can restyle any state through `className` without
touching a media query.

## Canonical source media

`SLIDE_CANONICAL_SOURCE_MEDIA` is derived from the same axes
(`canonicalMediaQueries`) — every width tier (`px > 0`), both orientations, and
every flag. Art-directed slide data (`<source media>`) should use strings from
this list, so the slide box, the asset choice, and the reorientation veil all
flip on the SAME thresholds. Strings outside it still work in the browser but
nothing guarantees they flip together — a sync test and Diagnostics both check
(see [diagnostics.md](./diagnostics.md)).

## Reorientation

Because the crop swap on device rotation flips on these same axes, a device
rotation can change which `<source>` matches. The stale-crop mask that covers
that swap keys on the media `signature` — see the orientation swap veil in
[slides.md](./slides.md). Slide identity is `id` + `content` only, so an
orientation crop swap never resets the viewing position.
