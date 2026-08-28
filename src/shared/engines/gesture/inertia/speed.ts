/** Speed along `distance`; 0 when velocity opposes it (or degenerate) — a
 * carried speed survives only when it helps the new motion. See ../README.md. */
export const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (
    direction === 0 ||
    !Number.isFinite(velocity) ||
    Math.sign(velocity) !== direction
  ) {
    return 0;
  }
  return Math.abs(velocity);
};
