# config/gesture.ts — swipe and inertial-release tuning

Touch-drag feel (part of the visual contract). The shapes and swipe/commit
semantics are in `config/types.ts`; the slot-normalization that rescales several
of these per measured slot is in [../architecture/gesture.md](../architecture/gesture.md).

## `CAROUSEL_SWIPE_CONFIG`

- **`cooldownMs`** — minimum gap between committed swipes.
- **`intentThreshold`** — px of travel before a drag is recognised as horizontal intent.
- **`resistance`** / **`resistanceCurvature`** — the rubber-band curve: it
  saturates at `1 / (curvature · r/(1-r))` px of UI travel (the "wall"). Lower
  either → softer early ramp, farther wall. Curvature is slot-rescaled at
  runtime, so the wall sits at the same relative pull on any slot.
- **`maxVelocity`** — velocity safety clamp.
- **`emaAlpha`** — smoothing factor of the live velocity EMA.
- **`quickFlickVelocity`** / **`quickFlickMinOffset`** — flick qualification,
  content-relative: calibrated for the reference slot and rescaled by
  `slot / reference` at runtime, so "fast/far enough to be a flick" feels
  identical on any slot.
- **`flickVelocityAlpha`** / **`flickPauseGraceMs`** / **`flickVelocityHalfLifeMs`**
  — flick memory: the decision judges the whole gesture (weighted-average
  velocity), surviving a finger settling before lift-off (grace, then half-life
  decay).
- **`catchDelayMs`** — the catch window: how long a press must rest before it
  brakes a moving strip. Inside it a vertical intent hands the gesture to the
  browser (so a page scroll started on the strip doesn't hitch it), a horizontal
  intent takes over immediately, a quicker lift stays a tap. Must stay well below
  the OS long-press, or the context menu opens before the catch (diagnosed).
- **`commit`** — the swipe-commit threshold in the carousel's own units: the
  resolver turns `slotShare` (clamped to `minPx`..`maxPx`) into the engine's
  `minSwipeDistance` for the measured slot, forcing the engine's own
  `swipeThresholdRatio` to zero.

## `CAROUSEL_INERTIAL_RELEASE_CONFIG`

- **`inertiaBoost`** — makes a fast swipe land faster than a passive base
  duration would imply.
- **`accelerationDistanceShare`** / **`decelerationDistanceShare`** — ramp shares
  of the release ride (the cruise target vs the smooth tail).
- **`minRideDurationMs`** — floor on the ride duration, so a vigorous flick on a
  narrow slot doesn't collapse to a teleport (continuity still wins — a launch
  speed that alone beats the floor is not slowed).
