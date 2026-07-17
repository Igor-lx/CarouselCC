# Carousel performance investigation

**Branch:** `claude6widgetfix` · **Device:** Redmi Note 11S (Android 13 / MIUI 14,
Snapdragon 680, Adreno 610, 1080×2400, Chrome 149) · **Method:** Chrome tracing over
adb-forwarded CDP, driven by Playwright. Cross-checked on Samsung A35 and iPhone 13.

This is the running record of a performance hunt: what was measured, what was proved,
what was **dis**proved, and what was fixed. It started as a search for one visible
micro-hitch and turned up two unrelated, real defects along the way.

Everything here is a **controlled A/B on the same device, same page, same trace
categories**, driven by programmatic clicks — no human input, ride windows anchored to a
`performance.mark` shared by page and trace. Where an experiment failed to support its
hypothesis, that is recorded too: the disproofs are the most valuable part of this file.

---

## Status

| | State |
| --- | --- |
| **Defect B — main thread runs a full paint lifecycle every frame of a *composited* ride** | **FOUND AND FIXED** ([§3.5](#35-the-cause-a-css-transition-fighting-the-waapi-fade)). The dot's CSS `transition` covered the same properties as its WAAPI fade, and two effects on one property cannot be composited. A ride went from **452 main frames (2696 ms) to 13 (80 ms)**. |
| **Defect A — widget dot animations cost ~7 ms/frame** | **No longer a per-frame cost; no rewrite needed** ([§7](#7-the-widget-needs-no-rewrite)). It was 7 ms *per main frame*, and main frames were being forced every frame. With the frame loop gone and the transition conflict fixed, the widget's expensive recalc happens **13 times per 4 rides instead of 670**. A latent tax, not a running one. |
| **The original micro-hitch** | **FOUND AND FIXED** ([§8](#8-the-micro-hitch--found-a-two-frame-finger-hold-zeroed-the-launch-velocity)). A two-frame finger hold before lift-off zeroed the launch velocity (fast EMA), so the ride crawled out of a standstill. Every frame was perfect — the CURVE stalled, which is why no frame counter could see it. |

---

## 1. The original quest — the micro-hitch

**Symptom (user, Redmi Note 11S):** one visible hitch per ride, mid-ride, in ≥70 % of
swipes — and **never** on a button press. Reproduces at roughly the same moment for
roughly the same swipe. Not a single slide jittering: **the whole strip** stutters
together. Invisible on Samsung A35 and iPhone 13.

Crucially it shows up on **slow** swipes — the ones that ride at about the same speed as a
button press. That killed the obvious "a swipe is just faster, so the same drop is more
visible" theory.

### What was measured, and what it says

| Instrument | Result |
| --- | --- |
| Dropped frames during the user's own reproducing (slow) swipes | **0**, across 7 rides |
| Real keyframes, captured by hooking `Element.prototype.animate` on live swipes | Smooth monotonic curve, **zero frozen stops** |
| Is the track animation composited? | **Yes** — `has_compositor_animation` on 839/841 ride frames |
| Slotless build, swipe vs button | The **button** (which feels perfectly smooth) had *more* dropped frames, *more* `BeginMainFrame` and *more* image decodes than the hitchy swipe |
| `adb screenrecord` + frame-by-frame pixel displacement | Strip moves smoothly, 2–7 px/frame — **but the instrument captures only ~40 of 60 fps, so it cannot resolve a single-frame stall.** Inconclusive, and reported as such. |

### Honest verdict

**Trace-level metrics do not explain the perceived hitch.** The hitch is real — the user
reproduces it at will, and it survived the removal of *every* slot (widget, pagination,
controls, preload, diagnostic). But three precise instruments — dropped-frame accounting,
captured keyframes, compositing state — all say the motion is smooth.

So the hitch is either **finer than these instruments' resolution**, or **not in the
strip's motion at all**. It is not a frame-delivery failure. Both defects below were found
while hunting it; neither turned out to be its cause.

> **Resolved in [§8](#8-the-micro-hitch--found-a-two-frame-finger-hold-zeroed-the-launch-velocity).**
> The instruments were not blind — they were looking at the right thing and it was
> genuinely perfect. Every frame arrived, on time, on the compositor, at the right
> position. What stalled was the **curve we handed the browser**: a two-frame finger
> hold before lift-off zeroed the ride's launch velocity, so the strip crawled out of
> a standstill. A frame counter cannot see that by construction. Reading this section
> in order is the point — the wrong turns are the lesson.

---

## 2. Defect A — the pagination dots cost 7 ms/frame

> **Scope.** Real, reproducible, worth fixing — and **not** the micro-hitch. The user
> removed the widget, then every slot, and the hitch remained unchanged.

During any ride the main thread runs a **full style recalculation on ~70 % of frames,
costing ~7 ms each**. The 60 Hz budget is 16.7 ms, so the widget alone eats **~45 % of it,
permanently**. Chrome flags the frames it then loses as `has_main_animation: true,
affects_smoothness: true` — lost *because the main thread could not finish in time*.

### 2.1 Does the widget cause it? — yes

| Variant | style recalcs | total time in recalc | per recalc |
| --- | --- | --- | --- |
| Widget **mounted** | 664 | **5031 ms** | **7.6 ms** |
| Widget **removed** | 670 | **171 ms** | **0.26 ms** |

The recalc *count* is unchanged (it happens every frame either way) — the widget makes each
one **30× more expensive**. `BeginMainFrame` halved, 6631 ms → 3348 ms.

### 2.2 Which part? — the dot animations, nothing else

| Variant | per recalc |
| --- | --- |
| A) as shipped | 7.07 ms |
| B) **dot WAAPI animations cancelled** (DOM + all static CSS kept) | **0.26 ms** |
| C) `will-change` stripped from dots | 7.32 ms (no change) |
| D) widget removed entirely | 0.25 ms |

Cancelling the animations while leaving every element and every style in place lands
exactly on the "no widget at all" floor. **The animations are the entire cost.**

### 2.3 Eight hypotheses, all disproved

Each was tested by cancelling the widget's animations and replacing them with synthetic
ones on the *same elements*:

| Hypothesis | Result | Verdict |
| --- | --- | --- |
| Rounded clip on the container blocks compositing | 7.2 → 7.5 ms | ❌ |
| `contain: layout paint` on the container | 7.7 ms | ❌ |
| Expensive dot CSS (`var()`/`calc()`, `::after`, `box-shadow`) | 6.2–8.2 ms | ❌ |
| Explicit `animation.startTime` in the past | 1.78 ms (vs 1.85 without) | ❌ |
| `fill: 'both'` | 1.77 ms | ❌ |
| `scale(0)` (a singular matrix) in the keyframes | 1.74 ms | ❌ |
| Keyframe **count** (33) | 40 kf ≈ 1.8 ms | ❌ |
| Float precision of the keyframe values | rounding → 7.16 ms | ❌ |

### 2.4 The actual mechanism — found

| Variant (same 11 elements, same 33 keyframes) | per recalc |
| --- | --- |
| Simple values, **identical for every dot** | **1.99 ms** |
| Simple values, **different per dot** | **6.85 ms** |
| The widget's real per-dot trajectories | 7.59 ms |

**The cost is driven by every dot having a DIFFERENT animated value.**

Blink shares one `ComputedStyle` object between elements whose computed style is identical.
When all dots animate to the same value, Blink computes **one** style and shares it. The
widget's projection is deliberately non-linear — each dot has its own `x` *and* its own
`scale` — so every dot resolves to a **unique** computed style every frame, and Blink must
run **11 separate full style computations per frame**.

This is not a bug in the CSS, the keyframes, or the way `animate()` is called. It follows
directly from the visual design: *"each dot scales and fades by its own distance from the
centre"* mathematically **requires** N distinct styles per frame, and a compositor cannot
evaluate a non-linear per-element projection.

| Configuration | main-thread style cost per frame |
| --- | --- |
| No dot animations | 0.26 ms |
| 11 animations, identical values | 2.0 ms |
| **11 animations, per-dot trajectories (shipped)** | **7.0 ms** |

### 2.5 Fix applied — don't animate invisible dots

Off-strip dots were animated for the whole step while completely invisible
(`opacity ≤ 0.001`). They are now written straight to their final value and skipped
(`usePaginationWidgetBinding`, commit `6597a48`). The visual is unchanged — the dots stay
mounted, so the strip never "runs out". Options 2–4 remain open, see [§7](#7-remaining-fix-options-for-the-widget).

---

## 3. Defect B — a full paint lifecycle on every frame of a *composited* ride

**The premise:** while the compositor animates the track, the main thread should be
**idle**. It is not. Even on a **slotless** carousel it runs, on essentially every frame:

```
ProxyMain::BeginMainFrame                      x695   3333ms   max 10.4ms
WebFrameWidgetImpl::UpdateLifecycle            x593   2116ms
LocalFrameView::RunPaintLifecyclePhase         x532   1235ms
LocalFrameView::pushPaintArtifactToCompositor  x373    435ms
Blink.Paint.UpdateTime                         x317    392ms
Layerize                                       x264    312ms
```

Paint, layerization and a compositor commit — behind a ride the compositor is already
painting. None of it should exist.

### 3.1 Suspect 1: the controller's per-frame tick — **fixed, but NOT the cause**

The JS motion controller is the visual-position SSOT, and it ticked
`requestAnimationFrame` every frame for the whole ride — *even while the compositor
painted the track*. A frame callback registered every frame drags Blink through a full
main-thread lifecycle.

During a composited ride that stream feeds **nobody**: the track binding bails on a live
compositor animation, and the widget follows the WAAPI plan, not the stream. Its only real
consumer was settle detection — which needs **one** callback at the end, not 60 per second.

**Fix:** `MotionStartOptions.isPassive` lets the runner tell the controller "this segment
is painted elsewhere". The controller then sleeps and wakes once, at the end, to settle. It
stays the position SSOT throughout — on-demand reads (`captureHandoff`, `sampleAt`) sample
the live curve, so an interruption mid-segment is as precise as under a frame loop.

**A/B (6 button rides, 11.4 s of riding), two builds one line of source apart:**

| | A: ticks every frame | B: passive |
| --- | --- | --- |
| `FireAnimationFrame` | x672 · 278 ms | **x0** |
| `ProxyMain::BeginMainFrame` | x672 · 3349 ms | x670 · 3243 ms |
| `Blink.Paint.UpdateTime` | x672 | x670 |
| `Layerize` | x671 | x670 |
| `Document::recalcStyle` | x678 | x676 |
| dropped frames | 11 | 11 |

**The tick is gone — and the lifecycle did not move.** The tick was real waste (278 ms of
main-thread JS per 11 s of riding, now zero) and removing it is architecturally right, but
it is **not** the source of the per-frame paint. Shipped anyway: it deletes work nobody
needed, and it clears the field.

### 3.2 Suspect 2: the pagination dots — **THIS SECTION WAS WRONG. They are the cause.**

> **Correction.** The experiment below removed the dots from the DOM and saw no
> change, and I concluded the dots were innocent. **That conclusion was false —
> the experiment was broken.** Removing an element does **not** cancel its WAAPI
> animation: a detached element has no layout object, so its animation cannot
> composite and keeps running as a *main-thread* animation. A second attempt,
> which recreated the animations with empty keyframes, failed the same way — an
> empty-keyframe animation still **runs** in Blink's timeline and still forces a
> main frame. Every "suppressed" phase still had live main-thread animations,
> which is why every phase came out identical.
>
> With the dots **truly** killed (cancel + neutered `startTime`/`play`, because
> the bindings resurrect a cancelled animation by assigning `startTime`):
>
> | | live animations | `BeginMainFrame` | `Paint` | `Layerize` | `has_main_animation` |
> | --- | --- | --- | --- | --- | --- |
> | as shipped | track + 2 dots | x453 (2467 ms) | x451 | x451 | 895/907 |
> | **dots truly dead** | track only | **x54 (384 ms)** | **x54** | **x54** | **0/483** |
>
> The track's animation, left alone, composites completely and the main thread
> goes quiet. **The dot animations are the entire source of the per-frame paint
> lifecycle** — which also unifies Defect B with [Defect A](#2-defect-a--the-pagination-dots-cost-7-msframe): one defect, not two.
>
> The open question moved: not *what* drives the frames, but **why the app's dot
> animations refuse to composite** — see [§3.4](#34-the-standing-contradiction).

The (flawed) original experiment follows, kept because its flaw is the lesson.



With the tick eliminated, the trace still reported a **main-thread animation driving 1099
of 1112 ride frames**. The only animations alive during a ride:

```
running [transform          ] x33kf  DIV._slideContainer   ← the track (composited)
running [opacity, transform ] x33kf  BUTTON._dot_...       ← pagination
running [opacity, transform ] x33kf  BUTTON._dot_... _dotActive
```

The dots animate `opacity` + `transform` with `will-change` set — textbook compositable —
yet plainly were not composited. So: remove pagination from the DOM entirely, re-measure.

| | A: as shipped | B: pagination removed |
| --- | --- | --- |
| `ProxyMain::BeginMainFrame` | x554 | **x555** |
| `Blink.Paint.UpdateTime` | x554 | **x555** |
| `Layerize` | x554 | **x555** |
| `has_main_animation` | 1105/1122 (98 %) | **682/692 (99 %)** |

**Zero effect.** This independently confirms the user's own finding: they removed every
slot and the behaviour was unchanged. The slots are not the source.

### 3.4 The standing contradiction

The dots are the source — but **nothing about them explains why**. Every property
of the app's dot animations was reproduced by hand, on the same elements, and
every reconstruction **composites for free**:

| Hand-made variant (no ride; app not involved) | `BeginMainFrame` | `has_main_animation` |
| --- | --- | --- |
| one dot, as-is | x7 | 0/361 |
| all 11 dots, identical values | x6 | 0/360 |
| all 11 dots, **distinct** values | x6 | 0/360 |
| all dots, **33 keyframes + `fill:both` + pinned `startTime`** (the app's exact shape) | **x5** | **0/361** |
| track **+** all dots together (a whole ride, by hand) | x7 | 0/362 |
| …plus a class change on the dots **mid-flight** | x11 | 0/371 |
| …plus a class change **before** `animate()` (React's order) | x11 | 0/366 |

And the app does **no per-frame work** during a ride. Instrumented over one full
ride (~114 frames): **3 `animate()` calls** (1 track, 2 dots), **1**
`getComputedStyle`, **1** inline style write, **0** `getBoundingClientRect`, **0**
animation cancels. The attribute churn is trivial: `dot[class] x2`,
`slide[data-active-zone] x4`, `img[fetchPriority] x4`.

Its real keyframes are unremarkable too — 33 stops of `opacity` + `scaleX(1.5 → 1)`,
`linear`, `fill: both`.

**So: the app's dot animations are main-ticked; byte-for-byte reconstructions of
them are not.** The blocker is not the element, not the container's clip, not the
keyframe values, not the keyframe count, not `fill`, not the pinned `startTime`,
not the co-running track animation, and not a class mutation in either order.
Something about *how or when the app creates them* is decisive, and it has not
been found yet. That is the next target.

### 3.5 The cause: a CSS transition fighting the WAAPI fade

The contradiction in §3.4 had one loose thread. Every hand-made replica of the
dot animation composited — and in the two variants where I "touched the class"
I added a **meaningless** class name, which changed no property, so **no
transition ever started**. I had reproduced everything except the one thing that
mattered.

`Pagination.module.scss` declares, on the dot:

```scss
.dot       { transition: opacity 0.4s, transform 0.5s; }
.dotActive { opacity: …; transform: scaleX(…); }   // the same two properties
```

and the WAAPI cross-fade animates **`opacity` and `transform`** — the same two.
During a ride React moves the `.dotActive` class (the trace shows `dot[class] x2`),
the transition fires, and Blink is left with **two effects driving one property**.
It cannot composite that, so it drops the fade onto the **main thread** for the
rest of the ride — and drags a full paint lifecycle through every frame behind a
ride the compositor was otherwise painting for free.

**Proved on the real app**, changing nothing but the transition (4 rides):

| | `BeginMainFrame` | `Paint` | `Layerize` | `recalcStyle` | `has_main_animation` |
| --- | --- | --- | --- | --- | --- |
| as shipped | **x452 (2696 ms)** | x452 | x452 | 256 ms | 896/909 |
| `transition: none` on the dots | **x12 (81 ms)** | x12 | x12 | 22 ms | **0/462** |

That is the floor a properly composited animation costs on this device (x8).

**The fix** (`usePaginationFade`): the transition is not deleted — it still owns
every *non-planned* flip (mount, drag retarget, the no-WAAPI fallback). It is
**suppressed for the duration of a planned step**: `transition: none` is written
inline *before* `animate()` — which also cancels a transition the class flip may
have already started — and restored when the fade is cancelled or finishes. The
visual is unchanged: during the step the WAAPI fade was already the thing you
saw. Measured with the fix in the build: **x13 (80 ms)** — identical to forcing
`transition: none` by hand.

**Why it hid for so long.** The code comment said *"animations beat transitions"*.
That is true **of the value** — the cascade picks the animation, so the picture is
correct — and completely silent **about the cost**. A defect that renders
correctly has nothing to show you; it only shows up as a number.

### 3.3 (superseded) The track's own animation is main-ticked while composited

With **only the track animating**, `has_main_animation` still covers **99 % of ride
frames** — and `has_compositor_animation` covers them too. The track's WAAPI transform
animation runs on the compositor **and is simultaneously ticked on the main thread**.

That main tick moves the transform node → `PaintArtifactCompositor::Update` → `Layerize` →
`pushPaintArtifactToCompositor`, every frame. **This is the entire remaining defect, and
nothing is left standing in front of it.**

**Open question:** why does Blink refuse to hand the track's animation *fully* to the
compositor? Candidates, all A/B-testable on the standing rig:

- `fill: "both"` on the track animation;
- the inline `track.style.transform` written immediately before `animate()` — a base-style
  conflict with the effect;
- `will-change: transform` on `.slideContainer` interacting with `contain: paint` on the
  slides;
- the slides' `transform: translateX(calc(var(--slide-lane) * (100% + var(--slides-gap))))`
  — a `var()`/percentage-dependent transform under an animating ancestor.

---

## 4. Fixes shipped from this investigation

| Fix | Commit | Verified by |
| --- | --- | --- |
| **A finger hold no longer zeroes the ride's launch velocity** | this branch | Ride opens at **96–119 %** of the strip's visible speed, was 52–70 % |
| **The dot's CSS transition no longer fights its WAAPI fade** | this branch | Ride: **452 main frames / 2696 ms → 13 / 80 ms** on device |
| Invisible dots are no longer animated | `6597a48` | Visual unchanged on device |
| Composited segments run without a frame loop (`isPassive`) | `1bef342` | `FireAnimationFrame` x672 → **x0** on device |
| Stable slide lanes (`layoutOrigin`) — no recenter jump, no layer re-record | earlier | 0 recenter jumps; rAF worst gap 50 ms → 18 ms |
| Chevron arrows invisible on iOS (inline SVG with a `viewBox` but no size) | `c758e26` | Visual, iPhone 13 |
| Warm fetched the wrong crop in portrait (`<picture>` art direction) | earlier | Portrait: 5 tall / 0 wide; landscape: 10 wide / 0 tall |

---

## 5. Tooling (`.perf-probe/`)

Probes connect over `adb forward tcp:9222 localabstract:chrome_devtools_remote` — use
`127.0.0.1`, never `localhost` (Node resolves it to IPv6; adb is IPv4-only).

| Probe | Purpose |
| --- | --- |
| `deviceDeep.mjs` | Non-invasive capture: touch marks only + full browser trace |
| `deviceDropAnalyze.mjs` | Dropped compositor frames per ride, with Chrome's own reason flags |
| `deviceAB.mjs` | Widget mounted vs removed |
| `deviceValuesAB.mjs` | Shared vs distinct keyframe values ← **decisive for Defect A** |
| `deviceKeyframes.mjs` | Hooks `Element.prototype.animate` to capture the *real* curve of a *real* swipe |
| `devicePassiveAB.mjs` | Controller tick on vs off ← **decisive for §3.1** |
| `deviceMainFrameSource.mjs` | Who drives the main frame: `has_main_animation` + live animation inventory |
| `deviceDotsCause.mjs` | Pagination removed vs kept ← **decisive for §3.2** |
| `abServe.mjs`, `abSanity.mjs` | Serve two builds to the phone over `adb reverse`; assert the page really mounted and rides *before* measuring |

### The two-build rig

`devicePassiveAB.mjs` compares two builds that differ by **one line of source**. Both are
built locally and served to the phone over `adb reverse` — so neither GH Pages caching nor
a second deploy can colour the result:

```
MSYS_NO_PATHCONV=1 npx vite build --base=/on/  --outDir .perf-probe/ab/on  --emptyOutDir
# flip the line
MSYS_NO_PATHCONV=1 npx vite build --base=/off/ --outDir .perf-probe/ab/off --emptyOutDir
node .perf-probe/abServe.mjs &
adb reverse tcp:8080 tcp:8080
node .perf-probe/devicePassiveAB.mjs
```

---

## 6. Traps that produced false results (all self-inflicted)

Recorded because each one nearly shipped a wrong conclusion.

- **The probe polluted its own measurement.** The first deep probe read
  `getComputedStyle(track).transform` every rAF — which *forces a style recalc every
  frame*. It "found" 7 ms/frame of style work that was partly its own. Every number in this
  file now comes from probes that touch nothing but `performance.mark`.
- **A stale `performance.mark`.** The page wasn't reloaded between runs, so
  `getEntriesByName("probe-press")[0]` returned the *previous* run's mark. The clocks
  misaligned and an entire button-ride analysis was invalid. Probes now call
  `performance.clearMarks` before marking.
- **Measuring a page that never mounted.** The first `isPassive` A/B reported a beautiful
  "91 % less main-thread work" — from a page whose JS 404'd, so nothing rendered at all.
  Caught by `FireAnimationFrame x0` in the *control* arm, which is impossible if rides are
  running. `abSanity.mjs` now asserts the carousel mounted, the button exists, rAF fires,
  and the track transform actually changes — *before* any measurement counts.
- **MSYS path mangling.** In Git Bash `--base=/off/` becomes `C:/Program Files/Git/off/`,
  and `/sdcard/rec.mp4` becomes `C:/Program Files/Git/sdcard/rec.mp4`. Prefix with
  `MSYS_NO_PATHCONV=1`.
- **The phone screen sleeping** during programmatic runs → 1.6 MB empty traces. Hold it
  awake with `adb shell svc power stayon true`.

---

## 7. The widget needs no rewrite

Measured after the two fixes, with `PaginationWidget` mounted (4 rides):

| | `BeginMainFrame` | `recalcStyle` | `has_main_animation` |
| --- | --- | --- | --- |
| as shipped | **x13 (106 ms)** | x13 (45 ms) | 13/465 |
| every transition in the widget killed | x12 | x12 | 20/467 |
| the dot animations killed outright | x13 | x13 | 24/467 |

All three are the same: **the widget is already at the floor.** Its dot
animations composite, and killing them buys nothing. There is nothing left to fix.

**So why did §2 measure 5031 ms?** Because 7 ms was the cost *per main frame*,
and at that time main frames were being forced on **every** frame — first by the
controller's per-frame tick, then by the transition conflict. Both are gone, so
the widget's expensive recalc now runs **13 times per 4 rides instead of 670**,
and its total cost collapses from 5031 ms to 45 ms.

The per-recalc cost is still real (3.5 ms — the N-distinct-styles mechanism of
[§2.4](#24-the-actual-mechanism--found) has not changed). It is now a **latent
tax, not a running one**: if anything ever forces main frames every frame again,
the widget will be expensive again. Worth knowing; not worth a redesign.

### 7.1 Quantisation was proposed, measured, and dropped

Option 2 below (round each dot's x/scale so several dots share a `ComputedStyle`)
was the last plausible lever. It was tested **before writing any code**, by
measuring its **ceiling**: kill the dot animations outright — nothing that keeps
the widget's visual can be cheaper than not animating at all.

| widget, 5 rides | dropped | style recalc | main thread |
| --- | --- | --- | --- |
| as shipped | **10/576 (1.7 %), all at start** | x16 · 54 ms (**3.40 ms** each) | 131 ms |
| dot animations **dead** (the ceiling) | **11/577 (1.9 %), all at start** | x16 · 32 ms (**1.99 ms** each) | 92 ms |

The recalc does get cheaper and the main thread saves 40 ms — **and the dropped
frames do not move.** So the ride-start drops are **not caused by the dots' style
recalc at all**. If the ceiling buys nothing, quantisation — which cannot even
reach the ceiling — buys less.

It would not have worked anyway: the dots sit **tens of pixels apart** on the
strip, so rounding to half a pixel cannot make their values coincide, and Blink
still computes 11 distinct styles. The sharing the option was built on never
materialises.

**Do not implement it.** Option 2 was inherited from the world where the recalc
ran 670 times per ride; at 16 times the arithmetic collapses.

What actually holds those ~10 frames at ride start is the first raster of the
entering slides and the layer commit — the intrinsic cost of starting to move,
and not something in this codebase.

### Options (all rejected — kept so the reasoning is not re-derived)

Ordered simple → structural. All must preserve the visual: a continuous strip where dots
*travel* (never pop in), shrinking and fading toward the edges.

**Option 1 — animate only the dots that are ever visible.** ✅ **Applied** (`6597a48`).

**Option 2 — quantise the projection.** Round each dot's `x`/`scale` to a small step
(≈0.5 px / 0.02) so several dots share a computed style and Blink can reuse one.
*Cost:* possibly 7 → 3–4 ms. *Visual:* sub-pixel, invisible **in principle** — must be
judged by eye. *Risk:* medium; too coarse a step reintroduces the steppiness.

**Option 3 — split translation from scale/fade.** One composited `transform` for the whole
strip; express the edge shrink/fade as a static `mask-image` gradient. *Cost:* ~7 → ~0.3 ms.
*Visual:* **CHANGES** — a mask fades and clips, it does not shrink a dot's geometry. Needs
a side-by-side prototype; this is a redesign, not an optimisation.

**Option 4 — per-dot composited transforms inside one layer.** Still needs N distinct
per-dot values per frame, so it does **not** escape the N-styles problem (registered
`@property` custom properties are also main-thread). **Likely a dead end — documented so it
is not re-attempted blindly.**

---

## 8. The micro-hitch — FOUND. A two-frame finger hold zeroed the launch velocity.

This is the defect the whole investigation started from: **one visible stick per
ride, on swipe only, never on a button press, and only on SLOW swipes.** It
survived every fix above (dropping from ~70 % of swipes to ~10–15 %), and every
frame-level instrument insisted the motion was perfect.

They were all right. **Nothing was wrong with the frames. The CURVE stalled.**

### 8.1 Why every instrument was blind

| Instrument | Verdict |
| --- | --- |
| dropped frames inside the ride | **0** |
| handoff position discontinuity (last JS paint vs the animation's curve) | **0.0 px** |
| `has_compositor_animation` | on every ride frame |
| last touch → last paint | **3–7 ms** (the strip tracks the finger perfectly) |

Every frame was delivered, on time, on the compositor, at the right position. A
frame counter *cannot* see this defect — the browser was flawless. The bug was in
the values **we handed it**.

### 8.2 What the eye actually saw

Recording real swipes, and capturing the **finger's own touch events** alongside
the **positions actually painted** (never reading a computed style — that trap is
in §6), the sequence is unmistakable:

```
--- ride #19 (before the fix) ---
    FINGER   last 20ms: 0.0 px/frame   |  last 60ms: 5.4 px/frame
    RIDE     opens at 2.8 px/frame
    px/frame: 3  3  4  6  7  8  9 10 10 10 10 ...
```

**The finger stops before it lifts.** Not slows — *stops*: 0.0 px/frame over the
final 20 ms, while it had been moving at 5.4. That is simply how a human finishes
a slow, deliberate swipe: you bring the slide to where you want it, hold for a
moment, and let go.

The strip faithfully stops with it. Then the ride opens at **2.8 px/frame** and
takes ~300 ms — a third of a second — to reach its cruise of 10.

So the eye sees: **moving → frozen → crawling → and only then away.** That is the
hitch. It is not a dropped frame. It is the strip *crawling out of a standstill*.

### 8.3 The cause, and it is written in the code's own comment

The gesture engine keeps two velocities, deliberately:

| | law | purpose |
| --- | --- | --- |
| `flickVelocity` | **slow** EMA (`flickVelocityAlpha: 0.45`) **+ pause protection** (`flickPauseGraceMs: 120`, `flickVelocityHalfLifeMs: 250`) | the gesture's INTENT — how fast you meant to throw it |
| `uiVelocity` | **fast** EMA (`emaAlpha: 0.85`), no protection | the instantaneous visible speed |

And `resolveReleaseLaunch` builds the ride's curve from both:

```
startSpeed  = visualVelocity   ← was uiVelocity
cruiseSpeed = max(intentSpeed, startSpeed)   ← flickVelocity × inertiaBoost
```

A fast EMA (α = 0.85) collapses to ~0 after **two frames** of no movement. And the
comment sitting directly above the release code says so, in as many words:

> *"The flick memory survives a lift-off hold on the human pause law (grace +
> half-life) — **NOT the per-frame EMA decay below, which zeroes a fast gesture
> after a ~2-frame stick**."*

The author **knew** the fast EMA zeroes on a terminal hold, and protected the
flick memory from it. The **launch** velocity was left on the unprotected fast EMA.

So a two-frame hold — the way every deliberate swipe ends — produced:

```
startSpeed  = 0        (the hold zeroed the fast EMA)
cruiseSpeed = high     (the flick memory survived the same hold)
```

…which is the **maximum possible acceleration ramp**: the ride had to climb from a
standstill to cruise across the whole `accelerationDistanceShare` (25 % of the
distance). The strip crawled out of the release.

**Every observation follows without strain:**

- **slow swipes only** — a deliberate swipe ends with a hold; a flick does not;
- **never on a button** — no gesture, no launch velocity, no ramp to misjudge;
- **once per ride, near the beginning** — the launch happens once, and the ramp is
  the first quarter of the distance;
- **not every time** — it depends on whether you held the finger or tore it away;
- **invisible on fast swipes** — a fast lift-off keeps the EMA high, the ramp
  collapses by itself (exactly as designed), and there is nothing to see.

The control case is in the same recording: rides where the finger was **still
moving** at lift-off (7.1 px/frame) opened at 5.2 and went straight into
`5 6 8 11 13 15 17 18` — no crawl, no hitch. The only difference was the hold.

### 8.4 The fix: give the launch velocity the same pause law

Not a workaround — a **restored symmetry**. A momentary hold is motor noise, not an
instruction to stop, and the engine already knows the difference; it simply applied
that knowledge in one place and not the other.

`launchVelocity` is the UI-domain twin of the flick memory: the same slow EMA, the
same grace + half-life pause protection. It is what now feeds `visualVelocity` in
the continuity launch. `uiVelocity` is untouched and still drives everything else.

It does **not** paper over a genuine stop: a long, deliberate hold decays
`launchVelocity` too, and the ride then correctly starts from rest (there is a test
for exactly that, so no future tuning can quietly erase it).

### 8.5 Verified on real swipes, on the live deploy

The ride's opening speed against the speed the strip visibly carried (its motion
over the 60 ms before lift-off):

| | before | after |
| --- | --- | --- |
| finger 4.9 px/frame | opens **2.8** (57 %) | — |
| finger 5.4 | opens **2.8** (52 %) | — |
| finger 8.0 | — | opens **8.2 (103 %)** |
| finger 5.6 | — | opens **6.2 (110 %)** |
| finger 5.7 | — | opens **5.5 (96 %)** |
| finger 4.9 | — | opens **4.9 (100 %)** |
| finger 4.3 | — | opens **4.2 (98 %)** |

**52–70 % → 96–119 %.** The strip now picks the motion up instead of restarting it.

And in the curve itself, which is what the eye actually reads:

```
before:  3  3  4  6  7  8  9 10 ...    (crawling out of a standstill)
after:   5  6  8  9 11 13 14 14 ...    (already moving)
```

A genuinely slow swipe stays slow — one recorded ride had the finger at 1.8
px/frame and opened at 0.7. The fix repairs a **zeroing**, it does not inflate speed.

---

## 9. Where things stand

All three defects are closed:

- the main thread is **idle during a ride** — 13 main frames per 4 rides, against a
  floor of 8 for a bare composited animation ([§3.5](#35-the-cause-a-css-transition-fighting-the-waapi-fade));
- the widget needs **no rewrite** ([§7](#7-the-widget-needs-no-rewrite));
- the micro-hitch's cause is **found and fixed** ([§8](#8-the-micro-hitch--found-a-two-frame-finger-hold-zeroed-the-launch-velocity)).

**Standing caveat on the hitch.** It was reported gone once before, on shorter use, and
came back at a lower rate under longer use. It is now reported gone again, and the ride
"visibly smoother". That is encouraging, not proof — a defect that appears in a fraction
of swipes needs *time*, not a good first impression. The measurement is unambiguous
(the ride opens at 96–119 % of the strip's visible speed instead of 52–70 %), and the
mechanism is understood, but the verdict belongs to extended real use.

### 9.1 What is left, measured (not guessed)

With the main thread idle, whatever remains is now the top cost — so it was measured
rather than assumed. Live deploy, 5 rides, widget mounted:

```
dropped 12 of 576 (2.1%)

WHERE they fall:  first 20% of the ride: 11    middle: 1    last 20%: 0
flags:            affects_smoothness + main_anim

competing work:   GPUTask                   x51  122ms
                  RasterTask (worker threads) x41   27ms
                  ImageDecodeTask           x 6    1ms
```

> **Correction — the 1 ms decode figure was confounded, and it was wrong to state
> it as a property of the system.** That run was taken against a deploy with
> `isPredecodeOn={true}`: decode was cheap **because the images were decoded ahead
> of the ride**, not because decode is harmless. Re-measured as a proper A/B, one
> flag apart:
>
> | | dropped | decode DURING the ride | raster | main thread |
> | --- | --- | --- | --- | --- |
> | `isPredecodeOn: true` | 12/578 (2.1 %, all at start) | **x18 · 10 ms** | 47 ms | 121 ms |
> | `isPredecodeOn: false` | 12/578 (2.1 %, all at start) | **x34 · 1000 ms** | 47 ms | 121 ms |
>
> Decode is **a second of work**, not a millisecond. `isPredecodeOn` earns its
> keep: it lifts that second out of the ride. Keep it on (with `preloadPagesNr: 2`).
>
> But note what did **not** move: **dropped frames are identical** — same 12, same
> 2.1 %, same burst at the start. Even a full second of decode does not cost
> smoothness, because it runs on worker threads and the GPU, past the compositor.
> Decode is a **CPU/battery** cost, not a jank cost — and the ride-start burst
> below is unaffected by it.

What is left is a **burst at the START of a step**: 11 of 12 drops land in the
first 20 % of the ride, where React's render, the active-dot class flip, the WAAPI
animation setup and the first raster of the entering slides all land in one frame.
`main_anim` on those frames confirms it — they are the few main frames that remain,
and they are all at the start.

That also explains the widget's higher drop rate (2.1 % vs 0.6 % for the plain
pagination): its expensive N-distinct-styles recalc lands squarely in that burst.

**Verdict: stop here.** The drops are at ride start, where the strip has barely
begun to move and the eye does not catch them — confirmed by hand on the device.
The only lever left is quantising the widget's per-dot values ([§7](#7-the-widget-needs-no-rewrite)),
which trades a fraction of a percent of dropped frames against a visual risk. Not
worth taking blind.

### 9.2 The post-lift "freeze": ground truth vs the eye

The report: external-button rides + vertical scrolls entirely OUTSIDE the
carousel; ~0.5s after the finger lifts, a single visible horizontal freeze of
the strip. Persisted "one-in-one" through every fix.

The decisive instrument: an armed screen recording where every touch
auto-launches a ride (so lifts land mid-flight by construction), a big
on-screen ride counter (the user calls out WHICH rides froze), an in-content
anchor line (vertical motion factored out of the horizontal measurement), and
a synchronized page event log.

The user flagged rides #1, #3, #5 (of the six on film). Frame-by-frame:

| ride | painted horizontal motion | verdict |
| --- | --- | --- |
| #1 (flagged) | 1250ms continuous, mean 12.4 px/frame, zero still-frames | clean |
| #2 (not flagged) | 1386ms continuous, 11.9 | clean |
| #3 (flagged) | 1719ms continuous, 9.9 | clean |
| #4 (not flagged) | 1753ms continuous, 10.0 | clean |
| #5 (flagged) | 1652ms continuous, 10.5 | clean |

Flagged and unflagged rides are pixel-identical, in BOTH axes (vertical
dynamics also match). Eliminated with ground truth along the way: catch-brake
(fixed, verified), syncGeometry resize cancel (guarded, verified), dvh relayout
(svh, verified), toolbar settle + scrollend crossings (rides cruise straight
through), off-screen layer re-entry (returns at full cruise from the first
visible frame), panel cadence (the display runs 60Hz matched to content), any
animation cancel (event log shows only onfinish cleanups).

**Verdict: the freeze is not present in the strip's painted motion** at the
instrument's resolution (±2 device px, ~30–60 fps effective). What remains is
below that resolution (a single 16ms frame — not what a "real, concrete,
visible" freeze is) or is perceptual. The one structural candidate left is the
ride's own DECELERATION TAIL: every ride ends with ~400ms at 1–4 px/frame — a
crawl the eye can read as a stall, timed right where a lift often lands. That
is a feel knob, not a defect: `decelerationDistanceShare` (a smaller share =
later, crisper braking with less crawl time) is the user's own tuning surface.

### 9.3 CAUGHT: the "backward bounce" lives in the PRESENTATION fences

The refined invariant (user): the artifact fires when THE PAGE STOPS SCROLLING
— at the lift for held scrolls, at fling-end for sweeping ones — and looks like
an instant backward jump with an instant return.

Produced frames are provably smooth (screenrecord band analysis: flagged and
unflagged rides pixel-identical; wide-radius backward-flash search: none). The
artifact is therefore in PRESENTATION — below everything screenrecord can see.
SurfaceFlinger --latency is gutted on this ROM; the working instrument is
Chrome's own PipelineReporter, whose async spans close on the real
presentation-feedback fence: their end-times ARE the physical present times.

**Result: a 33–50 ms presentation gap (2–3 vsyncs) at EVERY scroll stop**,
time-locked to the page-side touchUP/scrollend log:

| scroll stop | present gap |
| --- | --- |
| lift@668 / scrollend@1048 | 49.9 ms (+33.3) |
| lift@6097 / scrollend@6110 | 33.3 + 33.3 + 33.3 ms |
| scrollend@8928 | 33.3 ms (+2 more) |
| scrollend@11160 | 33.3 ms |
| lift@16084 / scrollend@16090 | 49.8 ms |
| lift@18914 / scrollend@18922 | 50.0 + 33.3 ms |

Perception math: at cruise the eye's smooth pursuit continues ~10–15 px during
a 50 ms hold; when the next frame lands, the image snaps back under the gaze —
read as "мгновенный отскок назад и возврат". No backward pixel ever exists.

**The trigger, from the same trace:** around each gap the display compositor
explodes — Graphics.Pipeline x340–547 vs x15 in a cruise control window,
MainFrame.Draw x28–44 vs 0 (the BROWSER UI drawing: the toolbar settle
animation), a burst of SurfaceControl transactions — and the renderer's frames
miss the latch (BufferReadyToLatch backlog). Scroll stop → toolbar settle →
viz aggregates two live surfaces → on Adreno 610 the strip's frames lose the
race for 2–3 vsyncs. Stronger devices fit the burst in budget — which is why
the Samsung A35 and iPhone 13 never showed it.

Every earlier blindness is now explained: traces counted frames as PRESENTED
(they were — late); screenrecord records the virtual display (composed
separately from the stalled physical presents); synthetic gestures never move
the toolbar, so every synthetic run was clean.

**Next discriminator (zero tooling):** scroll so the toolbar does NOT move
(small same-direction scrolls mid-page, bar already hidden) — if the bounce
vanishes, the toolbar settle is confirmed as the sole trigger. App-side remedy
would then be an inner-scroller layout (body non-scrollable, page scrolls in a
container → the URL bar never moves) — an architectural choice to weigh, not a
bug fix.

### 9.4 The decision: adapt to the jam, don't fight the road

With the mechanism proven (§9.3) the option space collapsed to three:

1. **Inner-scroller layout** (root pinned, toolbar never moves) — kills the
   artifact with certainty, but costs the auto-hiding URL bar and native
   pull-to-refresh. **Rejected by the user** — the trade is not worth it here.
2. **Rewrite our code** — examined exhaustively and honestly impossible: the
   stall happens between Chrome's GPU-process output and the panel, two
   levels below the web sandbox. Our frames are provably on time; there is no
   JS/CSS/WAAPI shape that changes how the system compositor aggregates the
   browser's own UI surface. (The WAAPI-migration analogy does not transfer:
   that conflict lived INSIDE our process, this one lives outside it.)
3. **Adapt: know the jam's schedule and don't ship into rush hour.** The
   vulnerable window is fully predictable from the page: finger on the glass →
   scroll/fling frames → browser-chrome resizes, then a short silent tail.

**Implemented (option A): autoplay yields to an unsettled viewport.**
`useViewportBusy` (shared/hooks/environment) raises synchronously on the
first touch ANYWHERE on the glass — not just the carousel — and decays
`AUTOPLAY_RESETTLE_DELAY_MS` (600 ms, diagnosed tunable) after the LAST
observed signal. The window self-extends on every scroll frame and every
chrome resize, so it covers flings and settles of ANY duration without being
tuned to either — per the project law that architecture must hold under any
legitimate settings, never the current knobs. `useCarouselAutoplay` adds it
to the pause rule; carousel-local pauses (drag, in-flight, off-screen, hover)
are unchanged. Zero cost with autoplay off (no listeners), no public API
change, every host benefits.

**Parked (option B): mid-ride graceful yield** — an in-flight CRUISE-phase
ride smoothly dropping to a crawl through the settle window and
re-accelerating (bounce magnitude = velocity x present-gap; a crawl makes a
50 ms gap sub-perceptual). All machinery exists (captureHandoff, curve
rebuild, continuity launch). Deliberately visible behaviour — awaits the
user's eye, not more analysis. Scope guard, when built, must key on the
CURVE PHASE, not on current knob values.

Button-commanded rides overlapping a scroll stop remain exposed until B: a
narrow, user-instigated overlap, accepted for now with the mechanism on
record.

### 9.5 Option B built: the scroll yield (awaiting the eye)

Two refinements happened between §9.4 and the build.

**Option A's first cut regressed, and the regression set a law.** The v1
`useViewportBusy` flipped React state inside the `touchstart` handler; with
autoplay on, that re-rendered the deck at the exact moment a finger landed —
a visible hitch of the in-flight ride, the very artifact class being fought.
Rewritten non-reactive (refs + timestamps, stable getter, checked when the
autoplay timer FIRES via `shouldDeferTick`; a deferred tick re-arms a full
interval). The law: **nothing on the input path may re-render anything** —
signals are read at decision time, never pushed through React.

**Option B shipped as `useScrollRideYield`** (motion/), same law, fully
imperative:

- **Trigger — structural, and NOT touch.** Only page-scroll signals engage
  it: `window` scroll, `window` resize, `visualViewport` resize. The chrome
  settle is CAUSED by page scrolling; a horizontal swipe on the deck never
  moves the toolbar, so gesture rides cannot brake themselves. This replaced
  §9.4's "CURVE PHASE" guard sketch — the phase idea gated by ride geometry,
  but the real structural fact is the signal's ORIGIN.
- **Brake**: on the first signal mid-ride, an atomic `captureHandoff` +
  segment rebuild (the repeated-click retarget path — old animation paints
  until the new one replaces it) re-times the ride: ramp from the LIVE speed
  down to `SCROLL_YIELD_CRAWL_SPEED_SHARE` of it within
  `SCROLL_YIELD_BRAKE_DURATION_MS`, then crawl toward the SAME destination.
  The crawl is a share of the observed speed — never an absolute — so it
  scales with any ride tuning. Needed a new profile shape
  (`createBrakeProfile`): the standard accel/cruise/decel builder can never
  cruise BELOW its entry speed by construction.
- **Resume**: every signal re-arms a quiet timer
  (`SCROLL_YIELD_RESUME_QUIET_DELAY_MS` past the LAST signal — the
  self-extending window again); on silence the ride re-times back to its
  pre-brake cruise (the captured entry speed, a structural value, not a knob)
  and finishes normally. The widget follows both re-timings as plan
  retimings (same `targetKey`), staying in phase by construction.
- **Scope guard, structural**: GO_TO slices (`strategy: "jump"`) are
  excluded — a far GO_TO's widget plan is authored over the whole
  preflight/teleport/approach command; re-timing one slice would desync the
  chain. Sign checks (velocity must point at the remaining distance), no
  magnitude thresholds anywhere.

This also closes §9.4's known gap: button-commanded rides overlapping a
scroll stop now yield too. Deliberately visible behaviour — the user's eye
decides whether it stays; rollback is one hook unmount (Carousel keeps
working without it), with the tuning constants preserved.

### 9.6 The yield became an interaction: the "vinyl brake"

The eye liked the slow-mo but not the seams, and the spec turned from
"hide the bounce" into "design a feel." Final model, after two on-device
passes:

**The metaphor (the user's):** a record spinning on its own; you brake it
by pressing a finger to the disc, and it spins free the instant you lift.
Press → slow NOW; release → fast NOW. Responsiveness is the whole point.

**One self-contained visual, unified across ride kinds.** The dive and the
exit no longer try to blend back into the original profile (step and
autoplay can be shaped oppositely — all-accel/instant-stop vs
instant-start/all-decel; blending into either is fragile). The yield reads
only the ride's live (position, velocity) and its *tempo*; it is the same
two-ramp shape whether the ride began from a drag, a button, or autoplay.
The prescribed-speed coupling from the first cut (sampling the original
curve's speed at the crawl point) is gone.

**Durations are PROPORTIONAL, not absolute.** Dive and exit ramps are
`SCROLL_YIELD_ENTRY/EXIT_DURATION_SHARE × the ride's own duration`
(read from `controller.getActiveSegment().duration`). A fast step dives in
a blink, a slow autoplay a touch more deliberately — each of a piece with
its own tempo, under any tuning. This retired the absolute `*_MS` brake and
resume constants.

**Ease-out ramps (new per-zone easing).** The dive/exit ramps use a
quadratic ease-out (steepest change at the START of the ramp), so the strip
drops into — and launches out of — slow-mo *instantly* on the triggering
event, then levels off. Standard motions keep smoothstep; the profile zone
gained an optional `easing` field, defaulting to smoothstep so every other
curve is byte-identical. (`zoneDuration` had to become easing-aware: a
zone's mean speed is `s0 + (s1−s0)·∫₀¹easing`, and the ramp distance is
derived from that same integral so a "duration share" means exactly what it
says regardless of the speed ratio.)

**The exit is event-driven — this was the "залипон".** The first cut waited
a 300 ms quiet timer after finger-up/scroll-stop before *starting* the
exit, then ramped gently — the strip "thought for ages," crawled on, and
sluggishly regained speed. Now: a finger lift with the scroll already
settled resumes on the touch event itself, zero delay. A resting finger
HOLDS the slow-mo (the hand still owns the viewport); the lift resumes it.
A fling that outlives the lift resumes when the scroll goes idle — detected
by a short `SCROLL_YIELD_SCROLL_IDLE_MS` (≈2 frames), a settle detector, not
a deliberate hold.

**Trade-off on record:** in the fling case the exit fires roughly when the
toolbar begins to settle, so the bounce can peek back there; in the
finger-held case the settle already passed under the finger, so the lift
exit is clean. Accepted for feel.

### A rule this investigation earned

**Never declare a CSS transition on a property that a WAAPI animation also drives.**
The cascade hides the conflict (the animation wins, the picture is right) while the
compositor pays for it on every frame. If a transition is needed for the states an
animation does not cover, suppress it while the animation owns the element.
