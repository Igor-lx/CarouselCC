import type { KineticConfig } from "./types";

/**
 * The blank's own out-of-the-box tuning — the same contract the embedded
 * gesture engine gives its swipe config: pass nothing and everything works;
 * a partial `config` merges over these per field.
 */
export const KINETIC_DEFAULTS: KineticConfig = {
  /**
   * Cruise of a programmatic `flyTo`, units/ms (px/ms for a 1:1 pixel
   * value). 0.6 ≈ 600 px/s — brisk but followable; the ride's duration then
   * falls out of the distance, so near and far targets share one visual
   * speed.
   */
  cruiseSpeed: 0.6,
  /**
   * Profile shape of every ride: 30% of the distance accelerating, 40%
   * decelerating, the rest cruising — a soft, generic S that reads well from
   * a standstill and into a landing alike.
   */
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.4,
  /**
   * The built-in release policy is a MOMENTUM GLIDE: the value travels
   * `launchVelocity × glideMomentumMs` beyond the release point and
   * decelerates to rest — classic kinetic-scroll feel. Time-dimensioned so
   * the glide scales with how fast the finger actually was: a lazy release
   * barely coasts, a flick sails.
   */
  glideMomentumMs: 260,
  /**
   * Below this release speed (units/ms) the value simply rests where it was
   * dropped — protects against a micro-twitch at lift-off launching a
   * creeping, pointless ride.
   */
  minGlideSpeed: 0.05,
};
