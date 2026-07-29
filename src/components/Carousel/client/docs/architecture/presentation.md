# Presentation

Everything the carousel hands to the DOM as presentation payload — class names,
CSS custom properties, and state attributes — assembled in one place so the
composition root composes rather than assembling styles inline.
`useCarouselPresentation` returns the merged class map, its slide-facing subset,
the root style, one style object per slide, and the active-flag attributes. Each
field is memoised on its own inputs.

## The JS → CSS contract

The division of labour is strict: **JS hands over DATA, never rules.** The
layout/animation RULES live in `Carousel.module.scss`; JS only publishes the few
numbers CSS cannot know on its own. Keeping the rules in the stylesheet is what
lets a host restyle through `className` without touching component code.

`cssVars.ts` is the single address for that contract. `CSSProperties` cannot
express custom properties, so each set of published variables is declared as an
interface there and nowhere else — "which variables does this component publish,
in what units" has exactly one place to look.

- **Root variables** (one object for the whole component): the veil fade timings
  and the live visible-slides count. The fade timings are sourced from config
  rather than written in the stylesheet because they are bound to a JS invariant
  (the reorientation veil's fail-open cap) and must not drift from it. The
  slide/sizer width rule needs the visible-slides count, which CSS cannot derive.
- **Per-slide variables**: only the lane — a slide's position in slot strides.
  It is the ONE datum that cannot be shared, since each slide sits in a different
  lane, so it is the only style built per element. (The lane itself is computed
  by `domain/track.ts`; see [domain](./domain.md).)

## The DOM payload (non-style halves)

`domPayload.ts` holds the pure, testable projections:

- **Slide class map.** `SlideItem` consumes a fixed subset of the component's
  classes, so the full merged map is projected onto exactly those keys — that
  projection is what stops the slide from depending on the component's whole
  class surface. A missing key becomes `""`, never `undefined`: rendering
  `className={undefined}` would drop the attribute and break a host's override
  chain.
- **Flag attributes.** Active viewport flags become `data-<flag>="true"` on the
  root, and only the ACTIVE ones are stamped. An absent attribute IS the "off"
  state, so a stylesheet matches `[data-short-landscape="true"]` and writes
  nothing for the default case.

## The lane-style cache (a real trap)

The lane styles are exposed as `slideStyleFor(virtualIndex)`, and each style
object behind it is **cached by virtual index**. The getter shape is deliberate:
a parallel array made "positionally aligned with `virtualSlides`" an invariant
only a comment could state, and left the caller indexing into it. Keying on the
virtual index the caller already holds removes the alignment question entirely.

The caching matters because `virtualSlides` is rebuilt
whenever `isMoving` flips (the visibility flags hang off it), i.e. at both the
start AND the end of every ride. But a slide's lane depends only on its own
`virtualIndex` and the layout origin, neither of which moved. Rebuilding the
style objects there would hand every mounted `SlideItem` a fresh `style` prop and
defeat its memo, re-rendering the whole deck twice per ride — in exactly the two
frames where the animation starts and settles, the two frames the carousel can
least afford it. Reusing the cached object keeps the prop `===`, so only slides
whose OWN flags changed re-render.

The cache is kept correct and bounded by two rules: a change in `layoutOrigin`
(a recenter) re-bases every lane, so the whole cache is dropped; otherwise the
map is pruned to the live render window each pass, so it cannot grow without
bound.
