# gesture

A self-sufficient, component-agnostic touch-swipe engine. One hook wires
production-grade horizontal swipe handling into any component: spread
`hostProps` onto an element, react to the callbacks — done. The whole surface
is exported from `index.ts`.

## Layout

| Folder | Role |
| --- | --- |
| `swipe/` | Gesture registration: the hook, host props, recognition (`internals/` is private). |
| `inertia/` | The kinetic MEANING of a release: `resolveReleaseKinetics` (flick judgment + continuity launch) and `projectMomentum` (default landing); low-level `resolveInertialRelease`/`resolveReleaseLaunch` stay exported. |
| `tests/` | The blank's own behavioural suite. |

Self-contained: imports only React and itself. Not machine-enforced — a stray
import simply fails to resolve in the project the folder was copied into.

## Principle

- **Touch pointers only** (mouse/pen ignored — those are clicks and scroll).
- **Horizontal only** — a press turning vertical is handed back to native
  scroll; a horizontal one is captured until release.
- **The host is not automatically the surface.** Pass `surfaceRef` to declare
  which subtree is draggable; presses outside it (chrome layered over the deck)
  are handed straight back — no ownership, no brake, no drag, and their click is
  never swallowed. Omit it and the whole host is the surface. For a point
  exception INSIDE the surface, mark the element `data-drag-ignore="true"`
  (`DRAG_IGNORE_ATTRIBUTE`).
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
| `DRAG_IGNORE_ATTRIBUTE` | Mark an element as not-surface: no ownership, no drag (its click still works). |

## End reasons (`PointerSwipeEndReason`)

How an owned gesture ended — the distinction carries MEANING for a consumer that
brakes motion on the press (catch-and-hold):

- `"release"` — the finger lifted (a deliberate hold ends here; on iOS a
  long-press menu also ends here).
- `"vertical-scroll"` — the engine recognised vertical intent: a page scroll
  crossing the surface, never a catch.
- `"external-cancel"` — the browser stole the pointer (native pan already in
  progress, context menu, system gesture). **On Android the long-press menu
  arrives THIS way**, so a consumer that must tell "menu" from "scroll" watches
  the `contextmenu` event alongside.

`launchVelocity` on the release payload is the continuity speed judged over the
WHOLE gesture (pause-protected), not the last frames — a momentary hold zeroes
the raw `uiReleaseVelocity`, which would otherwise launch from a standstill.

## Turnkey drag→value (`value` binding)

Pass `value: { read, write }` to remove the last consumer-side drag boilerplate.
The engine anchors at drag ACTIVATION (`read()`, not press) and calls
`write(anchor + uiOffset)` on activation and every move; `uiOffset` starts at ~0
at the re-anchored finger position, so the value continues from exactly where it
was, whatever the OS swallowed as touch slop. The binding is 1:1 with the finger
(one px = one unit) — a consumer whose value lives in another unit (slot-adaptive
px→slides) keeps the plain callbacks; a unit conversion is domain knowledge the
engine must not guess. `write` is where a `motion` consumer plugs its controller;
`read` is where a flying value is caught (cancel the ride, return the live
position → the drag picks it up mid-flight, no seam).

## Recognition internals (traps)

`usePointerSwipe` keeps all pointer state in refs (zero re-renders). The subtle
parts:

- **The catch window (`catchDelayMs`, default 250ms).** A press only becomes a
  brake if it OUTLASTS this window — at press time a deliberate catch-and-hold
  and a page scroll started on the surface are indistinguishable, so the engine
  waits. Vertical intent inside the window hands the gesture to the browser
  untouched; horizontal intent activates ahead of it; a quick lift stays a clean
  tap. Measured on device: a finger intending to scroll rests 100–250ms on the
  glass before its first move; a catch-and-hold rests far longer (the OS
  long-press is ~500ms). Click suppression is tied to a completed DRAG, never to
  ownership — so interactive children keep their clicks.

- **Event-time clock.** Velocities are computed from `event.timeStamp` (hardware
  side), not handler time: on a congested main thread events queue before they
  are handled, inflating dt and deflating every velocity — the slower the device,
  the number the flick. Fallback to `performance.now()` covers synthetic events
  with a zero timestamp.

- **Visual re-anchor (`visualStartX`).** The visual offset is re-anchored to the
  finger the moment the drag activates. The OS suppresses the first touch moves
  (touch slop) and queues input, so by activation the finger is already 20–40px
  from `startX`; measuring the visual offset from `startX` would teleport the
  deck on the first drag frame. Commit and flick judgment keep the full
  `startX`-based travel (`rawOffset`).

- **Commit decision (`resolveSwipeDirection`).** A release commits to a swipe
  two independent ways: a **quick flick** (gesture speed ≥ `quickFlickVelocity`
  over ≥ `quickFlickMinOffset`), or a **distance swipe** (raw offset crossed the
  resistance-adapted threshold `max(minSwipeDistance, width·swipeThresholdRatio)`
  scaled by `1 − resistance` — the user feels the RESISTED offset, not the raw
  finger travel). The judged speed is the DOMINANT of the last instantaneous
  velocity and the flick memory, so a gesture that decelerates before lift-off
  still reads as a flick, and a committed swipe rides at the speed it was flicked
  with.

  **Each way reads its own quantity for the DIRECTION**: a flick commits where
  the finger was going (the sign of the judged speed), a distance swipe commits
  where the content ended up (the sign of the offset). They differ exactly when
  a gesture reverses late — pull right, then flick back left without crossing
  the origin. Taking the offset there would commit RIGHT while handing back a
  negative `pointerReleaseVelocity`: one call, two contradictory answers, and a
  consumer aligning speed to travel would zero it and launch from a standstill.

- **`launchVelocity` on the slow law — the ride-crawl fix.** The continuity
  launch must NOT read the per-frame UI-velocity EMA: that zeroes after a ~2-frame
  stick, and a deliberate slow swipe ends with exactly such a terminal micro-hold.
  The ride then launched from a standstill and crawled through its whole
  acceleration ramp — a hitch the eye reads mid-ride that no frame counter can
  see (every frame is on time; the CURVE stalls). So `launchVelocity` is the
  UI-domain twin of the flick memory: same slow law, pause-protected (grace +
  half-life), captured BEFORE the terminal sample so a last-instant twitch can't
  wipe it. A genuinely long hold still decays it and the ride correctly starts at
  rest.

## Release model (`inertia/`)

`resolveReleaseKinetics` fuses two primitives into the profile endpoints a ride
needs:

- **Intent — flick judgment** (`resolveInertialRelease`). If the finger left
  faster than the consumer's base tempo, the cruise is the boosted release speed
  (`inertiaBoost`), so a hard flick rides visibly faster than a lazy one;
  otherwise the base tempo stands. The judgment reads the raw POINTER speed
  (the finger), not the resisted UI.
- **Continuity — launch shaping** (`resolveReleaseLaunch`). The ride STARTS at
  the velocity the eye saw at lift-off (pause-protected `launchVelocity`, or the
  larger aligned of it and a handoff velocity) and accelerates to the intent —
  content never jumps ABOVE its visible speed, and a fast lift-off makes start ≈
  cruise so the ramp collapses by itself.

`projectMomentum` is the DEFAULT free-value landing: project the release velocity
forward by `momentumMs`; below `minSpeed` it returns `null` ("rest where dropped"),
so a lift-off micro-twitch can't launch a creeping ride. Consumers with real
landing policies (snap grids, page targets) skip it.

## Pairing with `motion`

Gestures alone give offsets, velocities and a commit decision — enough for CSS
transitions. For a native-feeling ride add `motion`: the release meaning from
here feeds a `motion` profile the controller executes. The two connect by
recipe, never by import. For zero seams take the `kinetic` blank.
