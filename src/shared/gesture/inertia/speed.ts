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
