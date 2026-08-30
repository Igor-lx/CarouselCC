// Local copy by design (copy-portability; see shared/engines/motion/README.md).
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
