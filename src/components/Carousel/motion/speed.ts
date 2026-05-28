export const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (direction === 0 || !Number.isFinite(velocity) || Math.sign(velocity) !== direction) {
    return 0;
  }
  return Math.abs(velocity);
};

export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * speed;
