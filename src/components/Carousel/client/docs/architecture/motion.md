# Motion model

Carousel motion **semantics** live here ([`motion/`](../../motion)); the curves
and runtime are the shared engine (`shared/engines/motion`), release physics are
`shared/engines/gesture/inertia`. Why every planned motion runs through one
WAAPI compositor path rather than a CSS transition is
[ADR-003](../adr/0003-single-compositor-path.md).

## Controller and visual position

Exactly one `MotionController` per carousel — a numeric scalar producing
RAF-driven samples `{ progress, value, velocity, target, strategy, timestamp,
phase }`. [`visual-position/useVisualPosition.ts`](../../visual-position/useVisualPosition.ts)
wraps it and is the **sole SSOT** for the visible offset:

- `subscribe(listener)` — per-frame stream while a segment is active;
  subscribers mutate their own DOM in the callback, React uncoupled at this tempo.
- `getSnapshot()` — last emitted frame (cold imperative reads only).
- `sampleNow()` — exact position from the curve at `now()`, reflow-free.
- `applyImmediatePosition(position)` — publishes a drag position via
  `controller.set` (cancels active motion), so track, widget and runner observe
  one consistent source throughout a gesture.

A cold read that starts a new segment picks its origin per paint source, never
from the DOM: while the track is **JS-driven**, `getSnapshot()` is what was
painted; while a **compositor** animation owns it, `sampleNow()` is the closer
match. The painted position is always recovered from the controller's own math.

## Segments

`CarouselSegment` ([`motion/types.ts`](../../motion/types.ts)) has ONE shape: a
smoothstep accel / cruise / decel **profile**. No easing curves — every motion
is authored through distance shares (ramp-up + ramp-down; the remainder is
cruise). The engine **trusts the shares as authored**: if accel + decel > 1 the
cruise share goes negative and its zone is dropped, so the ramps over-fill the
travel — over-allocation is a misconfiguration Diagnostic reports, never one the
runtime reshapes (see [ADR-002](../adr/0002-trusted-runtime-inputs.md),
[diagnostics.md](./diagnostics.md)).

Two authoring modes feed one builder:

- **Duration-authored** (`"step"`): click step, autoplay step, snap-back, a
  non-inertial release. Shares come from `motion.stepProfile` /
  `autoplayProfile` / `snapBackProfile`; peak speed falls out of distance +
  duration (`resolvePeakSpeedForDuration`). A hot handoff's velocity becomes the
  start speed, so retargets stay velocity-continuous.
- **Speed-authored**: start / peak / end speeds + zone distances derive duration.
  - `"jump"` — **every GO_TO**, at `GO_TO_SPEED_MULTIPLIER × normalStepSpeed`
    (see teleport below).
  - `"repeated"` — repeated-click fast advance, one segment to the next boundary
    at `REPEATED_CLICK_SPEED_MULTIPLIER × normalMoveSpeed`.
  - `"gesture"` — inertial release; peak from EMA-smoothed release velocity ×
    `inertiaBoost` (see [gesture.md](./gesture.md)).

Every segment's temporal shape is normalised into the percent domain
(`profileProgressStops`: uniform time samples of distance-progress 0→1) — the
one consumer-agnostic artefact the track, the widget strip and the dot
cross-fade each encode into their own WAAPI keyframes.

## Handoff invariant

[`motion/useMotionRunner.ts`](../../motion/useMotionRunner.ts) is the ONLY place
the controller starts. On a non-idle `motionPhase` it samples the origin, builds
the segment and starts the controller **synchronously** in the same layout-effect
turn — no deferred-frame window; the compositor (not a delay) keeps a retarget
from reading as a stall.

An interrupting segment (repeated/opposite click, any takeover) starts from a
**single atomic handoff**: `controller.captureHandoff(startedAt)` returns one
coherent `{ position, velocity, strategy, timestamp }` read from the *same*
sample of the old curve. The controller exposes exactly one handoff API, so
position and velocity can never come from two moments — the type makes the
mistake unexpressible. `captureHandoff` is pure math (no emit/cancel);
`getSnapshot()` is the separate cold-read method and must never assemble a
handoff.

A **cold start** splits deliberately: origin from the reducer
(`state.fromVirtualIndex`, passed at dispatch), residual velocity from
`captureHandoff`. A **gesture release** is canonical from the reducer payload
(origin `fromVirtualIndex`, velocity `state.gesture.uiVelocity`, bound to the
same END_DRAG). On completion the runner dispatches
`MOTION_SETTLED { settledPosition }`; if a newer target already replaced the
logical one, the reducer re-anchors to the actual settled position.

There is no projection-source layer: track and widget subscribe to the visual
position directly, as independent listeners on the same RAF tick.

## Far GO_TO teleport

A far `GO_TO` cannot animate edge-to-edge (it would mount every intermediate
slide). It flies once it has `GO_TO_TELEPORT_MIN_PAGE_SPAN` intermediate pages
AND at least one would never be shown; anything shorter rides continuously. One
pure resolver ([`motion/timing.ts`](../../motion/timing.ts) `resolveGoToPlan`)
lays out the split, consumed by both the reducer and the segment factory so
logical landings and the animated profile cannot drift apart:

- **Preflight** — reducer moves `virtualIndex` a bounded
  `GO_TO_PREFLIGHT_PAGE_SPAN` page-screens out, keeps the final target in
  `teleportVirtualIndex` (kept bounded so the render window can't leak the far
  target); the segment accelerates only inside its first page-screen, then
  cruises.
- **Teleport** — on settle, `fromVirtualIndex`/`virtualIndex` jump to a bounded
  origin `GO_TO_FINAL_APPROACH_PAGE_SPAN` page-screens before the target;
  `teleportVirtualIndex` clears. Both spans are whole page-screen counts, so the
  transform jump lands on a page boundary — no slide caught mid-slot.
- **Approach** — enters at cruise on the final page, cruises, then decelerates
  to rest.

Accel/decel are **local page-screen budgets**: `GO_TO_DECELERATION_DISTANCE_SHARE
= 1` means "slow over the whole final page-screen", not the whole jump. Teleport
ON: every flight animates the same distance, so all flights share one duration,
which is also the CEILING for continuous rides (longer rides cruise
proportionally faster, land in flight time). `GO_TO_TELEPORT_ENABLED = false`
removes flights and ceiling — consistent speed instead of consistent time.

## Compositor and the motion plan

Every non-drag, non-instant segment is compositor-eligible; only a live finger
drag and the no-support fallback stay per-frame. An accel/cruise/decel profile
is not one cubic-bezier, but its percent-progress curve reproduces
piecewise-linearly as a keyframe list — one keyframe per uniform stop, default
linear interpolation. Keyframes (not CSS `linear()`) are used deliberately: they
run on any engine with `Element.animate` (~2015+).

The runner samples `profileProgressStops` once and hands the **same plan** to
every paint consumer:

- **Track** — `startCompositorMotion({ from, to, duration, stops, startedAt })`,
  one transform keyframe per stop.
- **Widget** and **dots** — the plan channel
  ([`motion/planChannel.ts`](../../motion/planChannel.ts), exposed as
  `motionPlan`): the widget folds the stops into its dot trajectories, the dots
  blend opacity/scale at each stop — all on the same `startedAt` clock, so the
  active dot arrives with the picture. Different travel distances, identical
  temporal shape — synchronized by construction.

The JS controller runs for **every** segment regardless — it stays the SSOT for
status, handoff, settle and the follow stream. Compositing only changes *who
paints*: while a compositor animation is live,
[`geometry/useTrackBinding.ts`](../../geometry/useTrackBinding.ts) suppresses its
own per-frame write for the subscriber path so JS samples and WAAPI keyframes do
not fight.

Guarantees:

- **Eligibility gate** is `Element.animate` itself (`isWaapiSupported`, cached).
  Without it the runner publishes a fallback `follow` plan and every consumer
  runs the per-frame path, dropping the same Nth frames
  (`FALLBACK_DROP_EVERY_NTH_FRAME`, evaluated by
  [`visual-position/fallbackPacing.ts`](../../visual-position/fallbackPacing.ts)
  on source-numbered frames, so track, widget and dots can't desync).
- **Graceful fallback** — `startCompositorMotion` returns `false` on no measured
  slot, no `Element.animate`, degenerate input, or a throwing engine.
- **Origin coherence** — the animation paints `from` synchronously and pins
  `startTime` to the segment's `startedAt`, so it traces the same timeline as the
  controller (not left play-pending, late under load); a handoff pin lands on the
  painted position, not a phase-shifted one.
- **Teardown** — `cancelCompositorMotion(position?)` freezes the track at a known
  transform and cancels, on idle / drag-takeover / fallback / geometry change /
  unmount.

The controller stays DOM-agnostic; track WAAPI lives entirely in
`useTrackBinding`, widget WAAPI in its binding. The compositor is a paint
optimisation under the SSOT, not a second source of truth.

## Stable slide lanes (paint-cost decoupling)

Two axes are separated so bounding memory does not cost a repaint:

- the **render window** ([`slides/useSlideRenderModel.ts`](../../slides/useSlideRenderModel.ts))
  decides which virtual slides are MOUNTED; it shifts by a slot on nearly every
  settle (see [slides.md](./slides.md));
- the **layout origin** is the coordinate base everything positions against; it
  is STABLE across window shifts and recenters only when the window has drifted a
  whole band (`LAYOUT_ORIGIN_BAND_SLOTS`).

Each slide is absolutely positioned at its own lane; only the track's
`transform` scrolls (`−(position − layoutOrigin) × slot`). Per the JS/CSS split,
`slideLane(virtualIndex, layoutOrigin)` (pure, domain) is published as
`--slide-lane`, `visibleSlidesNr` as `--visible-slides`, and
`Carousel.module.scss` turns them into each slide's `translateX` and width.
Because a lane depends on the STABLE origin, a per-settle window shift mounts one
edge slide and unmounts another and moves **no other slide** — the compositor
never re-rasters the whole track on settle. A finite deck's window never leaves
`[0, length)` so its origin never moves; an infinite deck recenters once per band
(~hundreds of rides), a rare atomic re-baseline that also bounds transform
magnitude.

## Module synchronisation

Modules that paint motion do **not** rely on React re-renders: they subscribe to
the stable observable objects (`motionPlan`, `visualPosition`) exposed on the
module context, so publishing per frame never re-renders React — only the logical
view (which dot is the target, control availability) flows through context at the
React tempo. How that context is partitioned by update cadence, and which module
reads which half, is in [context.md](./context.md).
