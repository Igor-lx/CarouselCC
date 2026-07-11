# Pointer-swipe gesture engine

A self-sufficient, component-agnostic touch-gesture engine. One hook call
wires complete, production-grade horizontal swipe handling into any
component: spread `hostProps` onto an element, react to the callbacks — done. Everything a
consumer may need is exported from this folder's facade (`index.ts`);
`internals/` is private machinery.

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

- `onPressStart()` — the engine took ownership of a press (fires immediately
  on a non-interactive surface; for an interactive child — only after
  horizontal intent, so taps stay clicks).
- `onDragStart(payload)` / `onDragMove(payload)` — `payload.uiOffset` is the
  resistance-shaped offset in px: near zero it tracks the finger ~1:1 and lags
  progressively as the pull grows (`resistance` / `resistanceCurvature`).
  There is no edge detection — the engine knows nothing about the consumer's
  boundaries; resistance is a global distance curve.
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
  is the EMA-smoothed UI-offset velocity (px/ms).

`enabled: false` removes the surface entirely: `hostProps` keeps only the
`ref` (so re-enabling and the forwarded consumer ref keep working) — no
listeners, no styles, no native handlers, as if the engine was never wired.

## Interactive children and the escape hatch

A press starting on a button, link, form control, editable element or common
interactive `role` never starts a drag by itself; it becomes one only after
clear horizontal intent, and a post-swipe click on it is suppressed during the
cooldown window. To opt any other element out of drag-starting, mark it (or an
ancestor) with the exported `DRAG_IGNORE_ATTRIBUTE`:

```tsx
<div {...{ [DRAG_IGNORE_ATTRIBUTE]: "true" }}>never starts a drag</div>
```

## Inertial release helper

`resolveInertialRelease({ gestureReleaseVelocity, distanceToTarget,
baseDuration, config: { inertiaBoost } })` converts a release velocity into a
speed intent for the consumer's own animation: releases slower than the base
`distance / duration` speed settle at base speed (`isInertialRelease: false`);
faster ones get boosted, never below base. Direction-opposing velocity counts
as zero (`sameDirectionSpeed`, also exported). The engine does not animate —
what happens after release is entirely the consumer's business.

## Exports

| Export | What it is |
| --- | --- |
| `usePointerSwipe` | The engine hook — returns `{ hostProps }` to spread onto the host. |
| `POINTER_SWIPE_DEFAULTS` | The built-in resolved tuning (a partial `config` merges over it). |
| `resolveInertialRelease`, `sameDirectionSpeed` | Release-speed math for consumer-side follow-through. |
| `DRAG_IGNORE_ATTRIBUTE` | Opt-out attribute name for drag-starting. |
| `PointerSwipeConfig`, `ResolvedPointerSwipeConfig`, `PointerSwipeProps`, `PointerSwipeResult`, `PointerSwipeHostProps`, `PointerSwipeHostRef`, `PointerSwipeListeners`, `PointerSwipeMovePayload`, `PointerSwipeReleasePayload`, `PointerSwipeDirection`, `InertialReleaseConfig`, `InertialReleaseResult` | The full public type surface. |
