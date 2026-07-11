# Motion controller engine

A self-sufficient, component-agnostic motion runtime. It animates **one
numeric value over time** — a track position, an opacity, an angle, any
number — by executing a consumer-supplied curve at RAF cadence and handing
coherent samples to subscribers. Everything a consumer needs is exported from
this folder's facade (`index.ts`).

## Scope (deliberate)

- **Runtime, not math.** The engine contains NO easing, NO profiles, NO
  opinions about how things move. The consumer brings a *sampler* — a pure
  function `(segment, timestamp) → sample` — and the engine is the clock,
  the loop, the state machine and the subscription hub around it. The
  player, not the record.
- **One value per controller.** Multi-value choreography is the consumer's
  composition (or several controllers).
- **Zero React re-renders.** State lives inside the closure; consumers read
  it through subscriptions and snapshot getters, never through render.

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
| `createMotionController` | The engine as a plain factory (no React). |
| `useMotionController` | React ownership wrapper — one instance per component lifetime. |
| `motionNow` | THE motion clock (`performance.now()` domain, SSR-safe). |
| `MotionController`, `MotionSample`, `MotionSampleData`, `MotionHandoff`, `MotionPhase`, `MotionSegmentBase`, `MotionSegmentSampler`, `MotionStartOptions`, `MotionSetOptions`, `MotionSnapOptions`, `MotionSubscriber`, `MotionCompletionMode` | The full public type surface. |
