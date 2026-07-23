# `motion` — make a value travel beautifully

A self-sufficient, gesture-agnostic motion engine: everything to animate ONE
numeric value — a position, an opacity, an angle. No finger required (autoplay,
clicks, programmatic motion). The whole surface is exported from `index.ts`.

## Layout

| Folder | Role |
| --- | --- |
| `profile/` | Curve maths: accel/cruise/decel profiles from speeds + distance shares; WAAPI percent-stops; the peak-speed-for-duration solver. |
| `runtime/` | Execution: the RAF controller, the motion clock (`motionNow`), the paint subscription (`useMotionPaint`). |
| `compositor/` | Delivery to the browser compositor: the pinned-animation primitive and the turnkey one-element rider (`useCompositedRide`). |
| `tests/` | The blank's own suite, incl. `portability.test.ts`. |

Self-contained: imports only React and itself (guarded by
`tests/portability.test.ts`), so it copies into any project as-is.

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

## Pairing with `gesture`

Finger drags a value, release rides a curve — the two engines connect by ONE
structural seam, `ride.dragBinding()` dropped into the gesture hook's `value`
prop, never by import (see `gesture`'s README). For zero seams — one hook,
everything fused — take the `kinetic` blank instead.
