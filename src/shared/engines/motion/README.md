# motion

A self-sufficient, gesture-agnostic motion engine: everything to animate ONE
numeric value — a position, an opacity, an angle. No finger required (autoplay,
clicks, programmatic motion). The whole surface is exported from `index.ts`.

## Layout

| Folder | Role |
| --- | --- |
| `profile/` | Curve maths: accel/cruise/decel profiles from speeds + distance shares; WAAPI percent-stops; the peak-speed-for-duration solver. |
| `runtime/` | Execution: the RAF controller, the motion clock (`motionNow`), the paint subscription (`useMotionPaint`). |
| `compositor/` | Delivery to the browser compositor: the pinned-animation primitive and the turnkey one-element rider (`useCompositedRide`). |
| `tests/` | The blank's own behavioural suite. |

Self-contained: imports only React and itself, so it copies into any project
as-is. Not machine-enforced — a stray import simply fails to resolve there.

## Principle

- **The runtime has no opinion about curves** — it executes any sampler
  `(segment, timestamp) → sample`; `profile/` is one (good) way to build them.
- **One value per controller**; multi-value choreography is composition.
- **Zero React re-renders** — state lives in the closure; read it through
  `subscribe` and snapshot getters, never through render.
- **One clock domain** — stamp every `startedAt` with `motionNow()`.

## Quick start

```tsx
const controller = useMotionController(0, "idle");
useEffect(() => controller.subscribe(({ value }) => paint(value)), [controller]);
controller.start({ segment, sampler, onComplete });
```

`useMotionController` owns the instance for the component's lifetime
(StrictMode-safe); `createMotionController` is the same engine without React.

## Key exports

| Export | What |
| --- | --- |
| `useMotionController` / `createMotionController` | The runtime, with / without React. |
| `motionNow` | THE motion clock (`performance.now()`, SSR-safe). |
| `buildProfile`, `createMotionProfile` | Accel/cruise/decel curves. |
| `profileProgressStops`, `resolvePeakSpeedForDuration`, `isWaapiSupported` | WAAPI keyframe transport. |
| `startPinnedAnimation`, `useCompositedRide` | Compositor delivery + one-element rider. |
| `useMotionPaint` | Paint-subscription hook (JS-fallback path). |

## Notes (traps)

- **Atomic handoff.** `captureHandoff(timestamp)` returns one coherent
  `(position, velocity)` from a single sample of the live curve — the only way to
  start a new segment. Never mix it with `getSnapshot` (the last *emitted* UI
  frame): one method, one answer, so a handoff can't splice a position from one
  moment with a velocity from another.
- **Passive segments** (`isPassive`). When a compositor animation paints the same
  curve, the controller runs the segment with NO frame loop — it sleeps and wakes
  once to settle, yet stays the position SSOT (on-demand reads sample the live
  curve, so a mid-segment interruption is as precise as under a frame loop).
  Ticking a segment nobody reads is not free: a per-frame callback drags a full
  paint lifecycle behind a ride that needs none.
- **`wake()`.** Recover a passive segment whose external paint owner vanished
  mid-flight (its compositor animation was cancelled — a geometry re-base, a
  rotation): the controller takes paint back and emits the remaining frames.
  Without it the value freezes where the animation died and teleports at settle.
- **WAAPI transport.** A profile's percent-progress `stops` are the
  consumer-agnostic artefact; each consumer encodes them as its own keyframes
  (default linear between), so any `Element.animate` engine (~2015+) runs the
  curve with no easing function. `startPinnedAnimation` pins the animation's
  `startTime` to the segment clock, so the compositor traces the SAME timeline as
  the JS controller — without the pin a late handoff paints a forward lurch.

## Curve math

- **Stop density is derived from the curve, not fixed.** The browser interpolates
  linearly between keyframes, so velocity is piecewise-constant and jumps at every
  stop; what the eye reads is that jump *relative to the tracked speed*. A zone's
  steepest acceleration is `1.5·Δv/T` (smoothstep peaks at 1.5× its mean slope),
  so the relative velocity step is dimensionless in time — the stop COUNT that
  keeps it under ~5% is the SAME for a 300 ms flick and a 3 s ride, on 60 Hz and
  120 Hz. A fixed count (32) let long rides step visibly; a fixed interval
  secretly encoded 60 Hz. Deriving it from the profile also keeps it honest under
  tuning (a sharper launch raises density on its own). Clamped to `[32, 256]`.
- **Peak-speed solver** (`resolvePeakSpeedForDuration`, duration-authored
  motions): with zone shares a/c/d, start speed s0, end 0, the zone times sum to
  `T = 2aD/(s0+p) + cD/p + 2dD/p`, a quadratic in the peak `p`:
  `T·p² + (T·s0 − 2aD − (c+2d)D)·p − (c+2d)·D·s0 = 0`; the peak is its positive
  root. Shares are trusted as authored — an over-allocated pair yields a negative
  cruise share, mirroring the profile builder — and if the handed-off start speed
  already exceeds the solved peak, the segment just arrives earlier than
  `duration` (continuity wins over exact timing).
- **Coarser consumers** re-sample the SAME stops to a sparser grid
  (`resampleStops`) — a pagination dot reads no step at any density yet would pay
  one keyframe per stop, so it rides a coarse copy; uniform-in-time and exact at
  both ends, so it stays synchronized.

## Pairing with `gesture`

Finger drags a value, release rides a curve — the two engines connect by ONE
structural seam, `ride.dragBinding()` dropped into the gesture hook's `value`
prop, never by import (see `gesture`'s README). For zero seams — one hook,
everything fused — take the `kinetic` blank instead.
