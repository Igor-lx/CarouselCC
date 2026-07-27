import type { KineticConfig } from "./types";

// Out-of-the-box tuning; a partial `config` merges over it per field. Field
// meanings in ./types.ts (KineticConfig).
export const KINETIC_DEFAULTS: KineticConfig = {
  /** `flyTo` cruise, units/ms — duration falls out of distance. */
  cruiseSpeed: 0.6,
  /** Ride profile shares: accel / decel of the distance (rest cruises). */
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.4,
  /** Momentum-glide window: a release travels `launchVelocity × this` further. */
  glideMomentumMs: 260,
  /** Below this release speed the value rests where dropped (twitch guard). */
  minGlideSpeed: 0.05,
};
