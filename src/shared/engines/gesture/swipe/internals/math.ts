// Pure numeric internals — no DOM, no React; total functions over numbers.
// See ../../README.md § Recognition internals.

const FRAME_BUDGET_MS = 1000 / 60;

/** Keeps `applyResistance` finite as `resistance` → 1. */
const MIN_RESISTANCE_DENOMINATOR = 0.001;

/**
 * Range clamp, and nothing else: a resistance outside `[0, 1]` is still a
 * resistance and lands on the nearest end.
 *
 * A NON-number is passed through **deliberately** — clamping arithmetic and
 * repairing a broken setting are different acts, and only the first one is
 * this engine's business. `NaN` here would come from a mistake at the mounting
 * side; substituting a plausible `0` would read as "no resistance was asked
 * for" and hide that mistake for good, while letting it through hands the
 * track a transform it cannot use and the swipe visibly dies. That is the
 * intended signal, not a gap — see ../../README.md § Inputs.
 */
export const safeResistance = (value: number) =>
  Math.max(0, Math.min(1, value));

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
  // No guard on `safe`: at 0 the ratio below is already 0, and a non-number
  // must not be stopped here either. The branch that used to stand here
  // decided nothing in both cases — two surviving mutants said exactly that.
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
 * velocity halves every `halfLifeMs`. See ../../README.md. */
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
