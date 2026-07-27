// See ./README.md — every guard accepts `unknown` and implies finiteness.
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isPositiveFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

export const isNonNegativeFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

export const isPositiveInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

export const greaterThan = (min: number) => (value: unknown): value is number =>
  isFiniteNumber(value) && value > min;

export const atLeast = (min: number) => (value: unknown): value is number =>
  isFiniteNumber(value) && value >= min;

/** `min <= value <= max` */
export const inRangeInclusive = (min: number, max: number) =>
  (value: unknown): value is number =>
    isFiniteNumber(value) && value >= min && value <= max;

/** `min < value <= max` */
export const inRangeExclusiveLower = (min: number, max: number) =>
  (value: unknown): value is number =>
    isFiniteNumber(value) && value > min && value <= max;

/** `min <= value < max` */
export const inRangeExclusiveUpper = (min: number, max: number) =>
  (value: unknown): value is number =>
    isFiniteNumber(value) && value >= min && value < max;
