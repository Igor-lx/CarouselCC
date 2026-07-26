# Geometry

The bridge between the abstract visual position (a virtual-index number) and the
real track DOM. It owns three things: measuring how wide one slide slot actually
is, writing the track's `transform`, and driving the compositor animation that
paints a ride. Everything that turns "the deck is at position X" into pixels on
screen lives here.

## Slot measurement

The slot width is **measured from the real viewport, never computed.** A slot is
not a clean fraction of the window — the viewport is capped, padded, and gapped —
so any JS formula would be a second, drift-prone source of truth beside the CSS.
`measureSlotSize` (in [domain](./domain.md)) is the one measurement definition;
both consumers below use it.

- **`useMeasuredSlotSize`** is the low-frequency reactive signal: the live slot
  px for consumers that are not on the motion hot path (the responsive `sizes`
  hint, the slot-adaptive swipe config). It recomputes only on mount, resize, or
  a slide-count change, and re-renders only when the rounded value moves past an
  epsilon. It is `null` until the first measurement (SSR / pre-mount) so
  consumers fall back explicitly.
- **`useResponsiveImageSizes`** turns that measured slot into the images' `sizes`
  attribute as a concrete pixel length. A `vw` formula would overstate the real
  (capped, padded) slot and bias the browser toward an oversized candidate — on a
  high-DPR phone, fetching and rasterising a needlessly large tile. With a true
  pixel `sizes`, the browser multiplies by DPR and picks the smallest candidate
  that covers the ACTUAL slot. Before the first measurement it falls back to the
  slot's nominal viewport fraction, so the markup always carries a usable `sizes`.

## The track binding

`useTrackBinding` wires the track element to the visual-position source. It owns
the slot-size measurement (ResizeObserver + window resize) and the transform
write, and returns a small imperative API — `readCurrentPosition`, `getSlotSize`,
`startCompositorMotion`, `cancelCompositorMotion` — consumed by the gesture
adapter and the motion runner.

### Writing the transform

The position becomes a `transform` two ways: a pixel `translate3d` once a slot
size is measured, or a `calc(...)` fallback against the track width and the gap
variable before the first measurement. Writes are deduplicated against the last
transform string, so an unchanged frame costs nothing.

The track carries no CSS `transition`: the JS controller writes `transform` per
RAF tick, and a transition would double-animate and fight it. It is disabled once
on mount — the track element is stable for the carousel's life, so it never needs
re-applying.

### Two paint owners

A ride is painted one of two ways, and they must never write the track at the
same time:

- **JS per-frame sampler** — the paint path for drag and for the legacy (no-WAAPI)
  fallback. It subscribes to the visual position and writes each frame.
- **Compositor animation** — a Web Animations keyframe run on the compositor.

While a compositor animation owns the track, the JS sampler still publishes its
authoritative timeline to non-track subscribers, but its per-frame transform
write bails *before* resolving the transform, so a composited frame costs no
string build. Only a `geometry` write (a render-window / resize re-baseline) is
allowed through, and that path cancels the compositor animation first.

### Starting a compositor ride

`startCompositorMotion` takes a plan's percent-progress curve as evenly-spaced
`stops` and builds one keyframe per stop — the temporal curve is carried by the
keyframe VALUES (default linear interpolation between them), so no easing
function is involved and any `Element.animate` engine runs it. It is the same
stop-reading the pagination variants use, so track and widget trace one curve
(see [motion](./motion.md)). The origin transform is painted synchronously so the
first compositor frame agrees with the sampler's `from` plateau, and the
animation's `startTime` is pinned to the segment clock so the compositor traces
the SAME timeline as the JS controller — without the pin, a later handoff paints
a forward lurch. On finish it pins the exact `to` transform; a degenerate input
or a missing WAAPI returns `false`, and the caller keeps the JS per-frame write.

### Cancelling, and handing paint back

`cancelCompositorMotion` freezes the track at a known transform before
cancelling. An explicit `position` (the usual case — the reducer/handoff origin)
is resolved through the same math the JS path uses; only when it is omitted does
it pay a `getComputedStyle` read to capture whatever the compositor curve was
showing. Then it **wakes the JS loop**: the compositor was the segment's paint
owner and the controller may have been running it passively with no frame loop,
so without the wake the strip would freeze there and teleport when the settle
fires. A cancel that immediately starts a new segment (takeover, retarget) has
its wake harmlessly superseded by that segment's own start.

### Reading the live position

`readCurrentPosition` is the cold read for a new segment's origin (a gesture
press, a navigation click) and returns where the track is ACTUALLY painted —
never a DOM read:

- **JS-driven track**: the last emitted frame IS what was painted, so use the
  snapshot (a fresh controller sample would be ahead of the paint).
- **Composited track**: the compositor has painted ahead of the last emitted
  frame, so the emitted frame is stale; the reflow-free `sampleNow` (the curve at
  `now()`) is the closer match.

### Re-baselining on geometry change

`syncGeometry` re-measures and decides whether the transform math changed. The
decision is judged through the SLOT, not raw pixels, so a height-only viewport
change (a mobile URL bar collapsing) does not tear down a healthy compositor
ride. A real change re-bases the transform math, so any compositor animation on
the old baseline is torn down and the track re-pinned — and the position is read
BEFORE the teardown, because afterwards `readCurrentPosition` would answer for a
JS track that never painted those frames.

### Fallback frame dropping

On engines without WAAPI, engine-driven segments are painted here frame by frame,
and the shared "drop every Nth running frame" rule is applied so the track and
the widget shed exactly the same frames and stay in lockstep. Drag frames are
published with a non-running phase and always paint.
