# Motion controller engine

A self-sufficient, gesture-agnostic motion library: everything to make **one
numeric value travel beautifully** — a track position, an opacity, an angle,
any number. Everything a consumer needs is exported from this folder's
facade (`index.ts`).

## Library layout & copy-portability

- `profile/` — the CURVE mathematics (the record): accel/cruise/decel
  profiles from speeds and distance shares, percent-progress stops (the
  WAAPI keyframe transport) with both ends of that transport — producing
  the stops AND consuming them (`keyframesAlongStops`, `positionAtNow`) —
  the peak-speed-for-duration solver, the WAAPI gate;
- `runtime/` — the EXECUTION engine (the player): the RAF controller, the
  motion clock;
- `tests/` — the library's own suite.

This folder imports **only React and itself** (enforced by
`shared/enginePortability.test.ts`), so it can be COPIED into another
project as-is — even its `clamp` is a sanctioned local copy.

## Scope (deliberate)

- **The runtime has no opinions about curves.** The controller executes any
  sampler — `(segment, timestamp) → sample`; the profile module is one
  (excellent) way to build such curves, not a requirement.
- **One value per controller.** Multi-value choreography is the consumer's
  composition (or several controllers).
- **Zero React re-renders.** State lives inside the closure; consumers read
  it through subscriptions and snapshot getters, never through render.
- **Gesture-agnostic.** Autoplay, clicks, programmatic animation — no finger
  required. Finger input is the sibling `gesture` library's business; the
  two connect by recipe (see its README), never by import.

## Quick start

```tsx
import { useMotionController, motionNow } from "shared";

const linear = (segment, timestamp) => {
  const progress = Math.min(1, (timestamp - segment.startedAt) / segment.duration);
  return {
    progress,
    value: segment.from + (segment.to - segment.from) * progress,
    velocity: (segment.to - segment.from) / segment.duration,
    target: segment.to,
    strategy: segment.strategy,
  };
};

function Meter() {
  const controller = useMotionController(0, "idle");

  useEffect(() => controller.subscribe(({ value }) => paint(value)), [controller]);

  const animateTo = (to: number) =>
    controller.start({
      segment: { strategy: "glide", from: controller.getSnapshot().value, to,
                 duration: 400, startedAt: motionNow() },
      sampler: linear,
      onComplete: () => console.log("settled"),
    });
}
```

`useMotionController` owns the instance for the component's lifetime
(StrictMode-safe: `destroy()` is a soft reset, the same instance survives the
double mount). Outside React, `createMotionController` is the same engine as
a plain factory.

## The sampler contract

A segment is any object extending `{ strategy, from, to, duration,
startedAt }`; the sampler must return `{ progress, value, velocity, target,
strategy }` for a timestamp. The engine trusts it and adds the envelope
(`timestamp`, `phase`). Two rules:

1. `progress >= 1` means "done": the engine emits a final settled sample with
   `value = target`, stops the loop, and fires `onComplete`.
2. All timestamps live in **one clock domain** — `motionNow()`
   (`performance.now()`, SSR-safe fallback `Date.now()`). Stamp `startedAt`
   with it and never mix in another time source, or anything synchronized to
   the same clock (e.g. a compositor animation pinned via
   `animation.startTime`) drifts out of phase.

## The two reads (do not mix them)

- **`getSnapshot()`** — the last *emitted* visual frame. For UI reads.
- **`captureHandoff(timestamp?)`** — the atomic motion-continuation point:
  position AND velocity sampled from the same instant of the live curve (or
  the resting sample when idle). For starting the next segment from a moving
  state — a retarget mid-flight picks up exactly where the eye sees the value
  and how fast it travels. Pure read: no emit, no cancel.

They answer different questions on purpose; mixing a position from one with
a velocity from the other is the classic handoff bug this split prevents.

## Lifecycle

- **`start({ segment, sampler, onComplete?, completion? })`** — replaces any
  running segment, emits the segment's initial sample synchronously, then
  ticks at RAF cadence. A degenerate segment (initial `progress >= 1`)
  settles immediately.
- **`set(value, options?)`** — instantaneous authored write (a finger, an
  external jump): kills the active segment, emits once. Defaults to an idle,
  zero-velocity sample; every field is overridable.
- **`snap(value, options?)`** — like `set` but emits a *settled* sample and
  supports `onComplete`.
- **`cancel()`** — freezes at the live curve point as idle; never fires
  `onComplete`.
- **`destroy()`** — soft, idempotent teardown: cancel + clear subscribers.
  The instance stays usable (StrictMode contract); call on real unmount.
- **`subscribe(listener, { emitCurrent? })`** — emits the current sample on
  subscribe by default (`emitCurrent: false` opts out); returns the
  unsubscriber.
- `completion: "immediate" | "next-frame"` (default `"next-frame"`) controls
  whether `onComplete` fires synchronously inside the settling call or on the
  next frame; without a `window` (SSR / tests) `"next-frame"` degrades to
  synchronous.

## Exports

| Export | What it is |
| --- | --- |
| `buildProfile`, `createMotionProfile`, `sampleMotionProfile`, `normalizeMotionProfileShares` | Profile curves: accel/cruise/decel from speeds + distance shares. |
| `profileProgressStops`, `sampleProgressStops`, `resolvePeakSpeedForDuration`, `isWaapiSupported` | The WAAPI keyframe transport: percent stops, duration solver, engine gate. |
| `createMotionController` | The runtime as a plain factory (no React). |
| `useMotionController` | React ownership wrapper — one instance per component lifetime. |
| `motionNow` | THE motion clock (`performance.now()` domain, SSR-safe). |
| `MotionController`, `MotionSample`, `MotionSampleData`, `MotionHandoff`, `MotionPhase`, `MotionSegmentBase`, `MotionSegmentSampler`, `MotionStartOptions`, `MotionSetOptions`, `MotionSnapOptions`, `MotionSubscriber`, `MotionCompletionMode` | The full public type surface. |
