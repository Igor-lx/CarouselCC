# kinetic

One hook, one value, one element: the finger drags it, a release glides it on
momentum (or snaps it — your policy), buttons fly it, and every ride runs as a
WAAPI animation on the compositor with a JS fallback. The most ready-to-deploy
member of the collection.

## What it is — a facade assembly

`kinetic` adds no new physics. It is a FACADE over its two forked engines
(`internal/gesture` + `internal/motion`): `useKineticValue` wires, once, every
seam the standalone engines leave to the consumer's rig —

- the drag→value binding (finger writes straight into the motion controller);
- the mid-flight catch (a drag's `read()` cancels the flying ride and returns
  the live position, so the finger picks the value up without a seam);
- the release kinetics → ride construction (a momentum glide by default, a
  custom `resolveTarget` landing policy when given) via a single `rideTo`;
- the compositor delivery + JS fallback + the one paint subscription.

The consumer supplies only the three things no library can know: which elements
(JSX), what the value LOOKS like (`keyframe`), and — optionally — where a release
lands (`resolveTarget`). For the physics themselves see the digested engines:
[`../motion`](../motion/README.md) and [`../gesture`](../gesture/README.md); the
forks under `internal/` mirror them (and may drift by design).

## Which blank do I take?

| Task | Blank |
| --- | --- |
| value follows the finger + rides curves, simple landing | **this one** |
| motion only — autoplay, progress, meters; no finger | `../motion` |
| full control — carousel-grade state machine, custom units | `../gesture` + `../motion` |

## Self-sufficient by DUPLICATION

Imports **only React and itself** (guarded by `tests/portability.test.ts`) —
copy the one folder into any React project and it works. It carries its own
**forks** of the gesture and motion engines (`./internal/gesture`,
`./internal/motion`), deliberately duplicated rather than imported. The forks
may drift from the standalone originals — by design.

## Quick start — the whole app

```tsx
const kinetic = useKineticValue({ keyframe: (x) => ({ transform: `translateX(${x}px)` }) });
return (
  <div {...kinetic.hostProps}>
    <div ref={kinetic.ref} className="circle" />
    <button onClick={() => kinetic.flyTo(kinetic.value() + 200)}>→</button>
  </div>
);
```

Drag with momentum glide, mid-flight catch, compositor rides and JS fallback —
all on by default. Everything tunes through `config` (`KINETIC_DEFAULTS`); a
landing policy plugs in as one function:

```tsx
useKineticValue({
  keyframe: (x) => ({ transform: `translateX(${x}px)` }),
  resolveTarget: ({ from }) => Math.round(from / 200) * 200, // snap grid
  onSettle: (x) => console.log("rested at", x),
});
```

## Chrome inside the host

The host owns the finger, so a control placed inside it — the `→` button
above — BRAKES a flying value when pressed and held (a resting finger is a
"catch the strip" gesture). Declare what is actually draggable and everything
else under the host becomes chrome: no ownership, no brake, no drag, click
still fires.

```tsx
const circleRef = useRef<HTMLElement | null>(null);
const kinetic = useKineticValue({ keyframe, surfaceRef: circleRef });

<div {...kinetic.hostProps}>
  <div ref={(n) => { kinetic.ref(n); circleRef.current = n; }} className="circle" />
  <button onClick={…}>→</button>   {/* chrome: leaves the ride alone */}
</div>
```

Omit `surfaceRef` and the whole host stays the surface — the default.

## Scope (deliberate)

- **One value, one moving element**, and the value is **1:1 with the finger**
  (pixels). Fanning to many elements or mapping pixels into other units is
  "full control" — take the standalone engines.
- Inertia is built in and invisible: the embedded gesture fork measures the
  release kinetics and the hook turns them into the ride.
