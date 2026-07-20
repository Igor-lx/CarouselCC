# Kinetic — the turnkey draggable value

One hook, one value, one element: the finger drags it, a release glides it
on momentum (or snaps it — your policy), buttons fly it, and every ride runs
as a WAAPI animation on the compositor with a JS fallback. This is the most
ready-to-deploy member of the library collection.

## Which folder do I take?

| task | folder |
| --- | --- |
| a value follows the finger + rides curves, simple landing policy | **this one** |
| motion only — autoplay, progress, meters; no finger anywhere | `shared/engines/motion` |
| full control — carousel-grade state machines, custom unit mapping | `shared/engines/gesture` + `shared/engines/motion` |

## Self-sufficient by DUPLICATION

This folder imports **only React and itself** (enforced by
its own `tests/portability.test.ts`, which travels with every copy) — copy the one folder into any React
project and it works. It achieves that by carrying its own **forks** of the
gesture and motion engines (`./internal/gesture`, `./internal/motion`),
deliberately duplicated rather than imported: every blank in the collection is a
standalone заготовка you pick by task, not a node in a dependency graph.
The forks may drift from the standalone originals as the blank evolves —
that is the design, not an accident.

## Quick start — the whole app

```tsx
import { useKineticValue } from "shared/engines/kinetic";

function Circle() {
  const kinetic = useKineticValue({
    keyframe: (x) => ({ transform: `translateX(${x}px)` }),
  });

  return (
    <div {...kinetic.hostProps}>
      <div ref={kinetic.ref} className="circle" />
      <button onClick={() => kinetic.flyTo(kinetic.value() + 200)}>→</button>
    </div>
  );
}
```

That is the complete deployment: drag with momentum glide, mid-flight catch
(grab the circle while it flies), compositor rides, JS fallback — all on by
default. Everything is tunable through `config` (see `KINETIC_DEFAULTS`),
and a landing policy plugs in as one function:

```tsx
useKineticValue({
  keyframe: (x) => ({ transform: `translateX(${x}px)` }),
  resolveTarget: ({ from }) => Math.round(from / 200) * 200, // snap grid
  onSettle: (x) => console.log("rested at", x),
});
```

## Scope (deliberate)

- **One value, one moving element.** Fanning a value into many elements, or
  mapping finger pixels into other units — that is "full control" territory:
  take the standalone engines.
- **The value is 1:1 with the finger** (pixels). Same reason.
- Inertia is built in and invisible: the embedded gesture fork measures the
  gesture's kinetics (pause-protected launch velocity), and the hook turns
  them into the ride — momentum glide by default, your `resolveTarget`
  otherwise.
