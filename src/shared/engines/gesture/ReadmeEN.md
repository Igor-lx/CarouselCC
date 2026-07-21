# `gesture` — turn a finger into intent

A self-sufficient, component-agnostic touch-swipe engine. One hook wires
production-grade horizontal swipe handling into any component: spread
`hostProps` onto an element, react to the callbacks — done. The whole surface
is exported from `index.ts`.

## Layout

| Folder | Role |
| --- | --- |
| `swipe/` | Gesture registration: the hook, host props, recognition (`internals/` is private). |
| `inertia/` | The kinetic MEANING of a release: `resolveReleaseKinetics` (flick judgment + continuity launch) and `projectMomentum` (default landing); low-level `resolveInertialRelease`/`resolveReleaseLaunch` stay exported. |
| `tests/` | The blank's own suite, incl. `portability.test.ts`. |

Self-contained: imports only React and itself (guarded by
`tests/portability.test.ts`).

## Principle

- **Touch pointers only** (mouse/pen ignored — those are clicks and scroll).
- **Horizontal only** — a press turning vertical is handed back to native
  scroll; a horizontal one is captured until release.
- **The engine OWNS its host element** — the `ref` in `hostProps` carries the
  listeners, the required styles and the native suppressors as one bundle;
  there is no wiring left to get wrong.
- **Zero re-renders** — state lives in refs, communication is by callback.
- Physics run on `event.timeStamp`, not handler time, so velocities stay
  honest on a congested main thread.

## Quick start

```tsx
const { hostProps } = usePointerSwipe({
  onDragMove: ({ uiOffset }) => (el.style.transform = `translateX(${uiOffset}px)`),
  onRelease: ({ direction }) => settle(direction),
});
return <div {...hostProps}>…</div>;
```

For a value 1:1 with the finger, pass `value: { read, write }` instead — the
engine anchors at `read()` and writes `anchor + offset`. No config is
required (`POINTER_SWIPE_DEFAULTS`); a partial `config` merges per field.

## Key exports

| Export | What |
| --- | --- |
| `usePointerSwipe` | The engine hook — returns `{ hostProps }`. |
| `POINTER_SWIPE_DEFAULTS` | Built-in tuning (a partial `config` overrides it). |
| `resolveReleaseKinetics`, `projectMomentum` | One-call release meaning + landing policy. |
| `resolveInertialRelease`, `resolveReleaseLaunch`, `sameDirectionSpeed` | Low-level release primitives. |
| `DRAG_IGNORE_ATTRIBUTE` | Mark an element to opt out of drag-starting. |

## Pairing with `motion`

Gestures alone give offsets, velocities and a commit decision — enough for CSS
transitions. For a native-feeling ride add `motion`: the release meaning from
here feeds a `motion` profile the controller executes. The two connect by
recipe, never by import. For zero seams take the `kinetic` blank.
