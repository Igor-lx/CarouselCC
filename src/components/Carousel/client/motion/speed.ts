// See docs/architecture/motion.md
// Speed helpers come from the motion engine, not the gesture library (a
// click/autoplay ride involves no finger).
export { alignSpeed as sameDirectionSpeed } from "../../../../shared";

/** A non-negative speed re-signed to point along `distance`. */
export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * speed;
