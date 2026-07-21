# `kinetic` — the turnkey draggable value

One hook, one value, one element: the finger drags it, a release glides it on
momentum (or snaps it — your policy), buttons fly it, and every ride runs as a
WAAPI animation on the compositor with a JS fallback. The most ready-to-deploy
member of the collection.

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

## Scope (deliberate)

- **One value, one moving element**, and the value is **1:1 with the finger**
  (pixels). Fanning to many elements or mapping pixels into other units is
  "full control" — take the standalone engines.
- Inertia is built in and invisible: the embedded gesture fork measures the
  release kinetics and the hook turns them into the ride.
