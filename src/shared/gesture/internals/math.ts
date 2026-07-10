/**
 * Pure numeric internals of the pointer-swipe engine. No DOM, no React —
 * every function here is a total function over numbers.
 */

const FRAME_BUDGET_MS = 1000 / 60;

/**
 * Lower bound for the `1 - resistance` denominator in the stiffness term.
 * Keeps `applyResistance` finite as `resistance` approaches 1.
 */
const MIN_RESISTANCE_DENOMINATOR = 0.001;

export const safeResistance = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Progressive drag resistance: the UI offset lags the raw finger offset more
 * and more as the pull grows. Applied to the WHOLE offset on every sample —
 * the engine knows nothing about edges or boundaries; near zero the output
 * tracks the finger almost 1:1, and the lag stiffens with distance
 * (`resistance` sets how strongly, `curvature` how fast it ramps).
 */
export const applyResistance = (
  offset: number,
  resistance: number,
  curvature: number,
): number => {
  const sign = Math.sign(offset);
  const abs = Math.abs(offset);
  const safe = safeResistance(resistance);
  const stiffness =
    safe <= 0 ? 0 : safe / Math.max(1 - safe, MIN_RESISTANCE_DENOMINATOR);
  return sign * (abs / (1 + abs * Math.max(0, curvature) * stiffness));
};

export const clampMagnitude = (value: number, limit: number) =>
  Math.sign(value) * Math.min(Math.abs(value), limit);

export const calculateEma = (
  previous: number,
  instant: number,
  alpha: number,
) => previous * (1 - alpha) + instant * alpha;

/**
 * EMA weight adjusted for a variable frame gap: a sample that arrives after
 * N frame budgets carries the weight N single-frame applications would have.
 */
export const frameAdjustedAlpha = (alpha: number, dt: number) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(1, dt / FRAME_BUDGET_MS);
  return 1 - Math.pow(1 - safe, frames);
};

/** EMA-decay a velocity toward zero over an idle gap of `dt` ms. */
export const decayedVelocity = (velocity: number, alpha: number, dt: number) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(0, dt / FRAME_BUDGET_MS);
  const elapsedAlpha = 1 - Math.pow(1 - safe, frames);
  return calculateEma(velocity, 0, elapsedAlpha);
};

/**
 * The component of `velocity` that points along `distance`. Returns `0` when
 * the velocity opposes the travel direction (or either input is degenerate),
 * so a handed-off in-flight speed is only ever preserved when it actually
 * helps the new motion.
 */
export const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (direction === 0 || !Number.isFinite(velocity) || Math.sign(velocity) !== direction) {
    return 0;
  }
  return Math.abs(velocity);
};
