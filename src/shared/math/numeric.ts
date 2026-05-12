export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const coerceFiniteNumber = (value: unknown, fallback: number) =>
  isFiniteNumber(value) ? value : fallback;

export const coercePositiveNumber = (value: unknown, fallback: number) =>
  isFiniteNumber(value) && value > 0 ? value : fallback;

export const coerceNonNegativeNumber = (value: unknown, fallback: number) =>
  isFiniteNumber(value) && value >= 0 ? value : fallback;

export const coerceClampedNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => clampNumber(coerceFiniteNumber(value, fallback), min, max);
