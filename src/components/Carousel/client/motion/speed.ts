// The motion layer's speed helpers come from the MOTION engine — this layer
// builds profiles from handoffs and must not depend on the gesture library
// for that (a click/autoplay ride involves no finger).
export { alignSpeed as sameDirectionSpeed } from "../../../../shared";

/** A non-negative speed re-signed to point along `distance`. */
export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * speed;
