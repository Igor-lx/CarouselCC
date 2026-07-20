# Pointer-swipe gesture engine

A self-sufficient, component-agnostic touch-gesture library. One hook call
wires complete, production-grade horizontal swipe handling into any
component: spread `hostProps` onto an element, react to the callbacks —
done. Everything a consumer may need is exported from this folder's facade
(`index.ts`).

## Library layout & copy-portability

- `swipe/` — gesture REGISTRATION: the hook, host props, recognition
  (`internals/` inside is private machinery);
- `inertia/` — the KINETIC MEANING of a release: the one-call fusion
  (`resolveReleaseKinetics` — flick judgment + continuity launch) and the
  default landing policy (`projectMomentum`); the underlying primitives
  (`resolveInertialRelease`, `resolveReleaseLaunch`) stay exported for
  bespoke pipelines;
- `tests/` — the library's own suite.

This folder imports **only React and itself** (enforced by
its own `tests/portability.test.ts`, which travels with every copy), so it can be COPIED into another
project as-is. The standard rig below references the `motion` library by
name, never by import — want the full ride physics, copy both folders.

## Scope (deliberate)

- **Touch pointers only.** Mouse and pen presses are ignored — desktop
  interactions belong to clicks and native scrolling.
- **Horizontal only.** A press that turns vertical is handed back to the
  browser (native scroll wins); a press that turns horizontal is captured and
  the engine owns it until release.

## Quick start

```tsx
import { usePointerSwipe } from "shared";

function Strip() {
  const { hostProps } = usePointerSwipe({
    onDragMove: ({ uiOffset }) => trackEl.style.transform = `translateX(${uiOffset}px)`,
    onRelease: ({ direction, uiOffset, uiReleaseVelocity }) => settle(direction),
  });
  return <div {...hostProps}>…</div>;
}
```

For a value that is 1:1 with the finger, the `value` binding removes even
that: `value: { read: () => current(), write: (v) => apply(v) }` — the
engine anchors at `read()` on drag activation and writes `anchor + offset`
on every move; the callbacks remain available alongside. Consumers whose
value lives in another unit (the carousel's pixels→slides mapping) keep the
plain callbacks — a unit conversion is domain knowledge.

No config is required — the engine ships its own tuning
(`POINTER_SWIPE_DEFAULTS`), and a partial `config` merges over it per field.
A component with opinions overrides only what it cares about; a component
without any passes nothing.

## The host element — enforced by construction

The engine OWNS its host element: the only way an element becomes the host is
the `ref` inside `hostProps`, and it travels in one inseparable bundle with
the listeners and the required styles (`touch-action: pan-y`,
`user-select: none`, overscroll containment). `<div {...hostProps}>` — and
there is no wiring left to get wrong: the native `click` / `touchmove`
suppressors, pointer capture, the width measurement and the pointer handlers
all land on the same element by construction.

A consumer that also needs the element for its own concerns (visibility
observers, focus management, measurement) passes an optional `hostRef` — the
engine forwards the host node into it, so the DOM node carries a single ref.
Note `hostProps` also carries `style`: a consumer styling the host element
via its own `style` prop should merge, not double-assign.

## Lifecycle and callbacks

`press → intent → drag → release/cancel`, all synchronous, zero re-renders —
the engine keeps its state in refs and talks only through callbacks:

- `onPressStart(payload)` — the engine took ownership of a press, which
  happens on the press itself for EVERY target: the finger landing IS the
  interaction ("catch the strip") — the consumer brakes its motion under the
  finger and control passes to the gesture immediately. Clicks are not
  sacrificed: click suppression is tied to a completed drag (the post-swipe
  cooldown), never to press ownership, so a tap on an interactive child still
  clicks — it just also brakes whatever was moving first.
  `payload.pressClientX` is where the finger LANDED — a consumer that brakes
  under a press uses it to settle a motionless release back onto the element
  that was actually pressed (so e.g. the browser's long-press menu, which the
  press may summon, describes the thing that stays in front of the eyes).
- `onDragStart(payload)` / `onDragMove(payload)` — `payload.uiOffset` is the
  resistance-shaped offset in px: near zero it tracks the finger ~1:1 and lags
  progressively as the pull grows (`resistance` / `resistanceCurvature`).
  There is no edge detection — the engine knows nothing about the consumer's
  boundaries; resistance is a global distance curve. The visual offset is
  anchored where the drag ACTIVATES, not where the finger first landed: the
  OS suppresses the first touch moves (touch slop) and queues input, so by
  activation the finger is already tens of px away — anchoring there starts
  the follow from rest instead of teleporting the surface on the first drag
  frame. Commit and flick judgment still count the full travel from the
  original touch point.
- `onRelease(payload)` — always fires exactly once per owned gesture, also on
  cancel. `direction` is the commit decision (`"left" | "right" | "none"`):
  a quick flick (gesture speed + token distance) or a slow pull past the
  resistance-adapted distance threshold. The flick — and the
  `pointerReleaseVelocity` (px/ms) handed out for inertial follow-through —
  judge the GESTURE, not its last segment: the engine keeps a
  weighted-average velocity memory (`flickVelocityAlpha`) that survives a
  finger settling before lift-off (`flickPauseGraceMs` grace, then
  `flickVelocityHalfLifeMs` half-life decay), so a fast swipe that ends in
  a brief stick still reads — and rides — as a flick. `uiReleaseVelocity`
  is the EMA-smoothed UI-offset velocity (px/ms). `launchVelocity` is its
  continuity-launch counterpart: the same UI-domain speed, but on the flick's
  slow law WITH the same pause protection. The fast EMA zeroes after a
  ~2-frame terminal hold — exactly how a deliberate slow swipe ends — and a
  ride launched from that zeroed reading crawls out of a standstill instead
  of picking the visible motion up. Launch rides from `launchVelocity`;
  everything else keeps reading `uiReleaseVelocity`.

All gesture math runs on the EVENT's own timestamp (`event.timeStamp`),
not the handler's processing time: on a congested main thread events queue
before they are handled, which would inflate dt and deflate every computed
velocity — the slower the device, the number the flick. Event timestamps
keep the physics honest under load and identical across devices.

`enabled: false` removes the surface entirely: `hostProps` keeps only the
`ref` (so re-enabling and the forwarded consumer ref keep working) — no
listeners, no styles, no native handlers, as if the engine was never wired.

## Interactive children and the escape hatch

A press starting on a button, link, form control, editable element or common
interactive `role` keeps its CLICK: a drag begins only after clear horizontal
intent, and a post-swipe click on it is suppressed during the cooldown window.
(Ownership — and the consumer's press-brake — still happens at the press, like
everywhere else; only the click semantics distinguish these targets.) To opt any other element out of drag-starting, mark it (or an
ancestor) with the exported `DRAG_IGNORE_ATTRIBUTE`:

```tsx
<div {...{ [DRAG_IGNORE_ATTRIBUTE]: "true" }}>never starts a drag</div>
```

## The standard rig (with the `motion` library)

Gestures alone give you offsets, velocities and commit decisions — enough
for CSS transitions or your own animation. For the full native-feeling ride
add the sibling `motion` library and connect three lines:

```ts
// 1. what the release MEANS (this library):
const intent = resolveInertialRelease({ gestureReleaseVelocity, distanceToTarget, baseDuration, config });
const launch = resolveReleaseLaunch({ distance, visualVelocity: launchVelocity, intentSpeed: intent.effectiveReleaseSpeed });
// 2. what the ride LOOKS like (motion/profile):
const profile = buildProfile({ from, to, startSpeed: launch.startSpeed, peakSpeed: launch.cruiseSpeed, endSpeed: 0, accelerationDistanceShare, decelerationDistanceShare });
// 3. who EXECUTES it (motion/runtime, or WAAPI via profileProgressStops):
controller.start({ segment, sampler });
```

## Inertial release helpers

`resolveInertialRelease({ gestureReleaseVelocity, distanceToTarget,
baseDuration, config: { inertiaBoost } })` converts a release velocity into a
speed intent for the consumer's own animation: releases slower than the base
`distance / duration` speed settle at base speed (`isInertialRelease: false`);
faster ones get boosted, never below base. Direction-opposing velocity counts
as zero (`sameDirectionSpeed`, also exported). `resolveReleaseLaunch` then
codifies the CONTINUITY LAUNCH: the ride starts at the velocity the eye saw
at lift-off (`startSpeed`) and accelerates to the intent
(`cruiseSpeed >= startSpeed`) — content never jumps above its visible speed;
a fast lift-off collapses the ramp by itself. The library does not animate —
what happens after release is entirely the consumer's business.

## Exports

| Export | What it is |
| --- | --- |
| `usePointerSwipe` | The engine hook — returns `{ hostProps }` to spread onto the host. |
| `POINTER_SWIPE_DEFAULTS` | The built-in resolved tuning (a partial `config` merges over it). |
| `resolveInertialRelease`, `resolveReleaseLaunch`, `sameDirectionSpeed` | Release physics: intent speed + continuity launch. |
| `DRAG_IGNORE_ATTRIBUTE` | Opt-out attribute name for drag-starting. |
| `PointerSwipeConfig`, `ResolvedPointerSwipeConfig`, `PointerSwipeProps`, `PointerSwipeResult`, `PointerSwipeHostProps`, `PointerSwipeHostRef`, `PointerSwipeListeners`, `PointerSwipeMovePayload`, `PointerSwipeReleasePayload`, `PointerSwipeDirection`, `InertialReleaseConfig`, `InertialReleaseResult` | The full public type surface. |
