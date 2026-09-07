// Pure numeric internals — no DOM, no React; total functions over numbers.
// See shared/engines/gesture/README.md § Recognition internals.

const FRAME_BUDGET_MS = 1000 / 60;

/** Keeps `applyResistance` finite as `resistance` → 1. */
const MIN_RESISTANCE_DENOMINATOR = 0.001;

// Positive form, per the guard idiom: `Math.max(0, Math.min(1, NaN))` is NaN,
// so the clamp passed a non-number through under a name that promises it cannot.
// `value > 0` is false for NaN and for anything below the range, and both land
// on 1:1 tracking — the same answer this engine already gives elsewhere when a
// number is not a number (`sameDirectionSpeed`, `projectMomentum`).
export const safeResistance = (value: number) =>
  value > 0 ? Math.min(1, value) : 0;

/** Progressive drag resistance: UI offset lags the finger more as the pull
 * grows (`resistance` = how strongly, `curvature` = how fast it ramps). */
export const applyResistance = (
  offset: number,
  resistance: number,
  curvature: number,
): number => {
  const sign = Math.sign(offset);
  const abs = Math.abs(offset);
  const safe = safeResistance(resistance);
  // No guard on `safe`: the clamp above keeps it inside [0, 1], and at 0 this
  // ratio is already 0 — the branch that used to stand here decided nothing.
  // Two surviving mutants said exactly that before it was removed.
  const stiffness = safe / Math.max(1 - safe, MIN_RESISTANCE_DENOMINATOR);
  return sign * (abs / (1 + abs * Math.max(0, curvature) * stiffness));
};

export const clampMagnitude = (value: number, limit: number) =>
  Math.sign(value) * Math.min(Math.abs(value), limit);

export const calculateEma = (
  previous: number,
  instant: number,
  alpha: number,
) => previous * (1 - alpha) + instant * alpha;

/** EMA weight adjusted for a variable frame gap (N budgets → N applications). */
export const frameAdjustedAlpha = (alpha: number, dt: number) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(1, dt / FRAME_BUDGET_MS);
  return 1 - Math.pow(1 - safe, frames);
};

/** Human-scale pause decay: a hold under `graceMs` costs nothing, beyond it the
 * velocity halves every `halfLifeMs`. See shared/engines/gesture/README.md. */
export const pauseDecayedVelocity = (
  velocity: number,
  pauseMs: number,
  graceMs: number,
  halfLifeMs: number,
) => {
  if (!(halfLifeMs > 0)) return velocity;
  const effective = Math.max(0, pauseMs - Math.max(0, graceMs));
  if (effective === 0) return velocity;
  return velocity * Math.pow(0.5, effective / halfLifeMs);
};

/** The argument with the larger magnitude (sign preserved). */
export const dominantMagnitude = (a: number, b: number) =>
  Math.abs(a) >= Math.abs(b) ? a : b;

/** EMA-decay a velocity toward zero over an idle gap of `dt` ms. */
export const decayedVelocity = (
  velocity: number,
  alpha: number,
  dt: number,
) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(0, dt / FRAME_BUDGET_MS);
  const elapsedAlpha = 1 - Math.pow(1 - safe, frames);
  return calculateEma(velocity, 0, elapsedAlpha);
};
