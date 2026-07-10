# Pointer-swipe gesture engine

A self-sufficient, component-agnostic touch-gesture engine. One hook call
wires complete, production-grade horizontal swipe handling into any component:
pass a ref, spread the listeners, react to the callbacks — done. Everything a
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
  const hostRef = useRef<HTMLDivElement>(null);
  const { listeners, hostStyle } = usePointerSwipe({
    hostRef,
    onDragMove: ({ uiOffset }) => trackEl.style.transform = `translateX(${uiOffset}px)`,
    onRelease: ({ direction, uiOffset, uiReleaseVelocity }) => settle(direction),
  });
  return <div ref={hostRef} style={hostStyle} {...listeners}>…</div>;
}
```

No config is required — the engine ships its own tuning
(`POINTER_SWIPE_DEFAULTS`), and a partial `config` merges over it per field.
A component with opinions overrides only what it cares about; a component
without any passes nothing.

## The host contract (the one hard rule)

`hostRef` is **required** (no internal fallback ref — one element, no
guessing) and it MUST point to the same element that receives `listeners` and
`hostStyle`. The engine ties three things to that element:

1. native `click` / `touchmove` suppression while a gesture is live;
2. pointer-capture acquisition and release;
3. the fallback width measurement for the swipe-distance threshold (the
   primary width is read from the event's `currentTarget` — the same element
   when the contract holds).

`hostStyle` is handed out **separately** from the listeners on purpose: it
carries styles the engine needs on the host (`touch-action: pan-y`,
`user-select: none`, overscroll containment) and the consumer merges it with
its own `style` consciously — a spread never silently wins or loses.

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
  a quick flick (velocity + token distance) or a slow pull past the
  resistance-adapted distance threshold. `pointerReleaseVelocity` (raw
  finger, px/ms) and `uiReleaseVelocity` (EMA-smoothed UI offset velocity,
  px/ms) let the consumer build inertial follow-through.

`enabled: false` removes the surface entirely: empty `listeners`, empty
`hostStyle`, no native handlers — as if the engine was never wired.

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
| `usePointerSwipe` | The engine hook. |
| `POINTER_SWIPE_DEFAULTS` | The built-in resolved tuning (a partial `config` merges over it). |
| `resolveInertialRelease`, `sameDirectionSpeed` | Release-speed math for consumer-side follow-through. |
| `DRAG_IGNORE_ATTRIBUTE` | Opt-out attribute name for drag-starting. |
| `PointerSwipeConfig`, `ResolvedPointerSwipeConfig`, `PointerSwipeProps`, `PointerSwipeResult`, `PointerSwipeListeners`, `PointerSwipeMovePayload`, `PointerSwipeReleasePayload`, `PointerSwipeDirection`, `InertialReleaseConfig`, `InertialReleaseResult` | The full public type surface. |
