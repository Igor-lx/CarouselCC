// See docs/architecture/motion.md
// Speed helpers come from the motion engine, not the gesture library (a
// click/autoplay ride involves no finger), and they keep that engine's own
// name: the gesture library exports a `sameDirectionSpeed` doing the same
// arithmetic, and one name for two origins turns every call site into a
// question of which import won.
export { alignSpeed } from "../../../../shared";

/** A non-negative speed re-signed to point along `distance`. */
export const signedVelocity = (speed: number, distance: number) =>
  Math.sign(distance) * speed;
