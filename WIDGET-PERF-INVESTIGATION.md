# PaginationWidget: a proven main-thread performance defect

**Branch:** `claude6widgetfix` · **Device:** Redmi Note 11S (Android 13 / MIUI 14,
Snapdragon 680, Adreno 610, 1080×2400, Chrome 149) · **Method:** Chrome tracing over
adb-forwarded CDP, driven by Playwright.

> **Read this first — scope.** This document proves ONE defect: the widget's dot
> animations burn ~7 ms of main-thread time on **every frame of every ride**.
> That is real, reproducible and worth fixing.
>
> It is **NOT** the cause of the single visible micro-hitch the user perceives on
> swipe. That was tested and disproved — see [§6](#6-what-this-is-not). The hitch
> hunt continues separately.

---

## 1. The measured defect

During any ride (click **or** swipe), the main thread runs a **full style
recalculation on ~70 % of frames, costing ~7 ms each**. The frame budget at 60 Hz is
16.7 ms, so the widget alone consumes **~45 % of it, permanently**.

Chrome flags the frames it then fails to deliver as
`has_main_animation: true, affects_smoothness: true` — i.e. the frame was lost
*because the main thread could not finish in time*, not because of GPU, raster or
decode.

---

## 2. How it was isolated

Every measurement below is a **controlled A/B on the same device, same page, same
trace categories**, driven by programmatic clicks (no human, no input injection), with
the ride windows anchored to a `performance.mark` shared by page and trace.

### 2.1 Does the widget cause it? — yes

| Variant | style recalcs | total time in recalc | per recalc |
| --- | --- | --- | --- |
| Widget **mounted** | 664 | **5031 ms** | **7.6 ms** |
| Widget **removed** | 670 | **171 ms** | **0.26 ms** |

The recalc *count* is unchanged (it happens every frame either way) — the widget makes
each one **30× more expensive**. `BeginMainFrame` halved, 6631 ms → 3348 ms.

### 2.2 Which part of the widget? — the dot animations, nothing else

| Variant | per recalc |
| --- | --- |
| A) as shipped | 7.07 ms |
| B) **dot WAAPI animations cancelled** (DOM + all static CSS kept) | **0.26 ms** |
| C) `will-change` stripped from dots | 7.32 ms (no change) |
| D) widget removed entirely | 0.25 ms |

Cancelling the animations while leaving every element and every style in place lands
exactly on the "no widget at all" floor. **The animations are the entire cost.**

### 2.3 What about the animations makes them expensive?

Each hypothesis was tested by cancelling the widget's own animations and replacing
them with synthetic ones on the *same elements*:

| Hypothesis | Result | Verdict |
| --- | --- | --- |
| Rounded clip on the container blocks compositing (`overflow:hidden` + pill radius) | 7.2 → 7.5 ms | ❌ not it |
| `contain: layout paint` on the container | 7.7 ms | ❌ |
| Expensive dot CSS (`var()`/`calc()`, `::after`, `box-shadow`) | 6.2–8.2 ms | ❌ overrides changed nothing |
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
| Widget's real keyframes, re-created by hand | 6.51 ms |

**The cost is driven by every dot having a DIFFERENT animated value.**

Blink shares one `ComputedStyle` object between elements whose computed style is
identical. When all dots animate to the same value, Blink computes **one** style and
shares it. The widget's projection is deliberately non-linear — each dot has its own
`x` *and* its own `scale`, so every dot resolves to a **unique** computed style every
frame, and Blink must run **11 separate full style computations per frame**.

This is not a bug in the CSS, the keyframes, or the way `animate()` is called. It is a
direct consequence of the widget's visual design: *"each dot scales and fades by its
own distance from the centre"* mathematically **requires** N distinct styles per frame,
and that work can only happen on the main thread — a compositor cannot evaluate a
non-linear per-element projection.

---

## 3. Cost summary

| Configuration | main-thread style cost per frame |
| --- | --- |
| No dot animations | 0.26 ms |
| 11 animations, identical values | 2.0 ms |
| **11 animations, per-dot trajectories (shipped)** | **7.0 ms** |

---

## 4. Tooling built for this (`.perf-probe/`)

All probes connect over `adb forward tcp:9222 localabstract:chrome_devtools_remote`
(note: `127.0.0.1`, never `localhost` — Node resolves it to IPv6 and adb is IPv4-only).

| Probe | Purpose |
| --- | --- |
| `deviceDeep.mjs` | Non-invasive capture: touch marks only + full browser trace |
| `deviceDropAnalyze.mjs` | Dropped compositor frames, placed inside each ride, with Chrome's own reason flags |
| `deviceAB.mjs` | Widget mounted vs removed |
| `deviceWidgetAB.mjs` | Which part of the widget (animations / will-change / DOM) |
| `deviceClipAB.mjs` | Rounded-clip compositing hypothesis |
| `deviceScaleZeroAB.mjs` | `scale(0)` hypothesis |
| `deviceValuesAB.mjs` | Shared vs distinct keyframe values ← **the decisive one** |
| `deviceSlotless*.mjs` | Bare carousel, swipe vs button |

### A measurement trap worth remembering

The first probe sampled the track's transform every rAF via
`getComputedStyle(track).transform`. **That forces a style recalc on every frame** and
polluted the very thing being measured — it showed 7 ms/frame of `updateStyle` that was
partly the probe's own. Every number in this document comes from probes that touch
nothing but `performance.mark`.

---

## 5. Why the eye can still miss it

7 ms of the 16.7 ms budget is a **tax, not a stall**. A button ride carries little other
main-thread work, so the frame still lands. It is a latent risk that turns into dropped
frames as soon as anything else needs the main thread.

---

## 6. What this is NOT

The investigation started as a hunt for a **single visible micro-hitch** the user sees
mid-ride on swipe (but never on button press). The widget looked like the answer.

**It is not.** Verified two ways:

1. The user removed the widget (and then *every* slot — pagination, controls, preload,
   diagnostic) and rebuilt. **The hitch remained, unchanged.**
2. A slotless build was deployed and measured on the same device — swipe vs button,
   identical page:

   | | dropped frames in rides | `BeginMainFrame` | image decodes |
   | --- | --- | --- | --- |
   | Swipe (7 rides) | 4 | 3333 ms | 2 (89 ms) |
   | Button (7 rides) | 5 | 4512 ms | 8 (499 ms) |

   The **button** — which feels perfectly smooth — has *more* dropped frames, *more*
   main-thread work and *more* image decoding than the swipe that feels hitchy. The
   track's animation is confirmed composited in both (`has_compositor_animation` on
   839/841 frames).

**Conclusion: trace-level metrics do not explain the perceived difference.** The hitch
is real (reproduced on a second weak device once the widget's noise was removed) but its
cause is still open. It is almost certainly a **motion-curve / content-position
discontinuity**, not a frame-delivery failure — the next step is ground-truth pixel
analysis (`adb screenrecord` + frame-by-frame displacement), because every model-side
measurement says the motion is smooth while the screen says otherwise.

---

## 7. Fix options for the widget (to be chosen)

Ordered simple → structural. All must preserve the visual: a continuous strip where dots
*travel* (never pop in), shrinking and fading toward the edges, all appearing to move by
the same visual distance.

### Option 1 — Animate only the dots that are ever visible
Off-strip dots are animated while invisible (`scale 0`, `opacity 0`) for the entire step.
Skip their animations; keep them mounted and statically hidden.
- **Cost:** ~7 ms → ~4–5 ms (fewer distinct styles).
- **Visual:** identical. The invisible dots are still *there*, so the strip never "runs out".
- **Risk:** low. Must keep any dot that becomes visible *at any point during the step*.

### Option 2 — Quantise the projection
Round each dot's `x`/`scale` to a small step (e.g. 0.5 px / 0.02) so that **several dots
share the same computed style** and Blink can reuse one `ComputedStyle`.
- **Cost:** unknown until measured; potentially 7 ms → 3–4 ms.
- **Visual:** sub-pixel quantisation, invisible in principle — **must be verified by eye**.
- **Risk:** medium. Too coarse a step reintroduces the steppiness we are trying to avoid.

### Option 3 — Split translation (composited) from scale/fade (static)
Give the whole strip **one** composited `transform` animation, and express the
edge shrink/fade as a **static mask** on the container (`mask-image` gradient) instead of
per-dot scale/opacity.
- **Cost:** ~7 ms → ~0.3 ms (one composited animation, zero per-dot styles).
- **Visual:** **CHANGES.** A mask fades and clips; it does **not** shrink a dot's
  geometry. The user's concern is exactly right: dots of different sizes moving by the
  same distance is *not* the same picture. This needs a visual prototype before any
  commitment.
- **Risk:** high — this is a redesign, not an optimisation.

### Option 4 — Full rewrite: one composited layer, per-dot transforms inside
Animate the strip container's translation on the compositor; give each dot its own
composited `transform` whose value is a function of the strip offset. This still needs
per-dot values per frame — so it does **not** escape the N-distinct-styles problem unless
the per-dot value can be expressed without style recalc (e.g. registered
`@property` custom properties, which are *also* main-thread).
- **Assessment:** likely a dead end. Documented so it is not re-attempted blindly.

### Recommendation
**Option 1 first** (safe, visual-preserving, measurable), then **measure Option 2** and
judge the quantisation by eye. Treat Option 3 as a design decision requiring a
side-by-side prototype, not a performance patch.
