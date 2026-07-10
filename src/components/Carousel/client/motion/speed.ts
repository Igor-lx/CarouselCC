export { sameDirectionSpeed } from "../../../../shared";

/** A non-negative speed re-signed to point along `distance`. */
export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * speed;
