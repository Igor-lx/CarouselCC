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
| **The original micro-hitch** | Still unexplained ([§1](#1-the-original-quest--the-micro-hitch)). Every model-side instrument says the motion is smooth. |

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

The options below are therefore **not needed**. Kept only so the reasoning is not
re-derived from scratch if that latent cost ever matters.

### Options (no longer required)

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

## 8. Next

The main thread is now **idle during a ride** — 13 main frames per 4 rides, against
a floor of 8 for a bare composited animation. Defect B is closed and the widget
needs nothing.

What remains is the question that started all of this: **the micro-hitch**
([§1](#1-the-original-quest--the-micro-hitch)). It is worth re-testing on the device
now, because the machine underneath it has changed completely: the main thread no
longer runs a paint lifecycle behind the ride, so if the hitch was a main-thread
stall of any kind, it should be gone. If it survives, then every model-side
instrument agreeing that the motion is smooth means the hitch is not in the
strip's motion at all — and the hunt moves to what else the eye could be seeing.

### 8.1 What is left, measured (not guessed)

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

**Image decode was the obvious suspect and it is innocent** — 1 ms. The old
"8 decodes / 499 ms" belonged to a world where the main thread was saturated;
raster and decode now run on worker threads and the GPU, and fit the frame budget.

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

### A rule this investigation earned

**Never declare a CSS transition on a property that a WAAPI animation also drives.**
The cascade hides the conflict (the animation wins, the picture is right) while the
compositor pays for it on every frame. If a transition is needed for the states an
animation does not cover, suppress it while the animation owns the element.
