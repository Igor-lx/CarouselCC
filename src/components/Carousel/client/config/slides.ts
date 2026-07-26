// Slide-layer image tuning. See docs/config/slides.md for what each governs.

import type { ImageRetryPolicy, ReorientVeilTiming } from "./types";

/** Orientation-swap veil timing (ms). */
export const SLIDE_REORIENT_VEIL = {
  fadeOutMs: 650,
  fadeInMs: 550,
  veilMaxMs: 2250,
} satisfies ReorientVeilTiming;

/** Failed-image retry policy (ms / attempts). */
export const IMAGE_RETRY = {
  baseDelayMs: 400,
  maxDelayMs: 8000,
  maxAttempts: 5,
} satisfies ImageRetryPolicy;
