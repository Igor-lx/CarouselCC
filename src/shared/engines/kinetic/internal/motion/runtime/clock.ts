// THE motion clock — one time domain for samples, startedAt, and WAAPI pins.
// Never mix in another time source (see shared/motion/README.md § One clock domain).
export const motionNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
