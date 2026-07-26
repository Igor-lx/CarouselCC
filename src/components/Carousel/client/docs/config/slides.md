# config/slides.ts — slide-layer image tuning

Image and reorientation tuning for the slide layer, grouped into two typed
objects. (Art-direction axes live in `config/viewport.ts` — see
[viewport.md](./viewport.md).)

## `SLIDE_REORIENT_VEIL` — orientation-swap veil timing

Masks the stale-crop repaint on device rotation (see
[../architecture/slides.md](../architecture/slides.md)). Fade-out and fade-in
are separate on purpose — the two directions read differently.

- **`fadeOutMs`** — veil fade-out. Starts mid-rotation (the OS flips orientation
  part-way through the tilt, so part of it hides inside the system rotation
  animation) and its frames are dropped by the relayout; disappearance also
  reads as instant while appearance reads as a process — so the fade-out needs
  extra time to stay perceptible.
- **`fadeInMs`** — veil fade-in; runs on a calm settled screen, so it needs
  less. Also times the slow-load reveal (a still-loading image held invisible,
  then faded in) — the same perceptual act, deliberately one knob.
- **`veilMaxMs`** — fail-open cap: past it, showing the old crop beats hiding the
  image, so the veil lifts. Must cover a full fade out + in (diagnosed).

## `IMAGE_RETRY` — failed-image retry policy

A failed slide image retries while the slide sits in the active band, on
exponential backoff (`baseDelayMs * 2^(failures - 1)`, clamped to `maxDelayMs`),
and is given up after `maxAttempts`.

- **`baseDelayMs`** — first backoff delay.
- **`maxDelayMs`** — backoff ceiling (must be ≥ base, diagnosed).
- **`maxAttempts`** — attempts before the slide gives up.
