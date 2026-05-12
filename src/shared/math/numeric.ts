export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
