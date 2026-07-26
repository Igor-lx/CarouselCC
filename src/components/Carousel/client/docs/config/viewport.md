# config/viewport.ts — viewport axes

The single source of the carousel's breakpoint names/numbers and flag
conditions. The model (attribute-driven styling with no CSS media queries,
canonical `<source media>` strings) is in
[../architecture/viewport.md](../architecture/viewport.md).

- **`SLIDE_VIEWPORT_BREAKPOINTS`** — width tiers as `name: minWidthPx`.
  Resolution is purely by number (largest matching threshold wins), so
  naming/order can't shadow a tier; a zero-width tier is the always-matching
  fallback.
- **`SLIDE_VIEWPORT_FLAGS`** — arbitrary named boolean viewport conditions →
  `data-<name>`; each condition is written literally here so the component owns
  it (not imported from a shared primitive).
- **`SLIDE_VIEWPORT_BASE_BREAKPOINT`** — names the base tier (styled by the plain
  rule, not a `[data-breakpoint]` block). A styling fact, not derivable from the
  table: a widest-tier-first stylesheet's base is the widest tier while the
  resolver's fallback is the narrowest.
- **`SLIDE_VIEWPORT_AXES`** — the axes as one object (passed to `useMedia`).
- **`SLIDE_CANONICAL_SOURCE_MEDIA`** — every media string recognised for
  `<source media>`, derived from the axes; slide data should use these
  (Diagnostics warns otherwise).
