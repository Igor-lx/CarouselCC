# config/slides.ts — slide-layer image tuning

Image and reorientation tuning for the slide layer. (Art-direction axes live in
`config/viewport.ts` — see [viewport.md](./viewport.md).)

## Orientation-swap veil

Masks the stale-crop repaint on device rotation (see
[../architecture/slides.md](../architecture/slides.md)). Fade-out and fade-in are
separate knobs on purpose — the two directions read differently.

- **`SLIDE_REORIENT_FADE_OUT_MS`** — veil fade-out. Starts mid-rotation (the OS
  flips orientation part-way through the tilt, so part of it hides inside the
  system rotation animation) and its frames are dropped by the relayout;
  disappearance also reads as instant while appearance reads as a process — so
  the fade-out needs extra time to stay perceptible.
- **`SLIDE_REORIENT_FADE_IN_MS`** — veil fade-in; runs on a calm settled screen,
  so it needs less. Also times the slow-load reveal (a still-loading image held
  invisible, then faded in) — the same perceptual act, deliberately one knob.
- **`SLIDE_REORIENT_VEIL_MAX_MS`** — fail-open cap: past it, showing the old crop
  beats hiding the image, so the veil lifts. Must cover a full fade out + in
  (diagnosed).

## Image retry

A failed slide image retries while the slide sits in the active band, on
exponential backoff (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given
up after `MAX_ATTEMPTS`.

- **`IMAGE_RETRY_BASE_DELAY_MS`** — first backoff delay.
- **`IMAGE_RETRY_MAX_DELAY_MS`** — backoff ceiling (must be ≥ base, diagnosed).
- **`IMAGE_RETRY_MAX_ATTEMPTS`** — attempts before the slide gives up.
