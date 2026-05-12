export const averageSpeed = (distance: number, duration: number) => {
  if (!(duration > 0)) return 0;
  return Math.abs(distance) / duration;
};

export const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (direction === 0 || !Number.isFinite(velocity) || Math.sign(velocity) !== direction) {
    return 0;
  }
  return Math.abs(velocity);
};

export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * Math.max(0, speed);
