import { sameDirectionSpeed } from "./speed";

/**
 * The CONTINUITY LAUNCH policy of a gesture release (etalon scroll physics):
 * the ride starts at the velocity the eye SAW at lift-off and accelerates to
 * the intent speed — content never jumps above its visible speed.
 *
 * - `visualVelocity` — the UI-domain velocity at release (what was painted);
 * - `handoffVelocity` — optional velocity of an already-running motion the
 *   release takes over (zero for a plain finger drag);
 * - `intentSpeed` — the unsigned target speed (e.g. `resolveInertialRelease`
 *   output).
 *
 * Returns the profile endpoints: `startSpeed` (never above the visible
 * speed's magnitude) and `cruiseSpeed >= startSpeed` — a fast lift-off makes
 * them equal and the acceleration ramp collapses by itself.
 */
export interface ReleaseLaunchInput {
  /** Signed remaining travel; only same-direction velocities survive. */
  distance: number;
  visualVelocity: number;
  handoffVelocity?: number;
  intentSpeed: number;
}

export interface ReleaseLaunch {
  startSpeed: number;
  cruiseSpeed: number;
}

export const resolveReleaseLaunch = ({
  distance,
  visualVelocity,
  handoffVelocity = 0,
  intentSpeed,
}: ReleaseLaunchInput): ReleaseLaunch => {
  const startSpeed = Math.max(
    sameDirectionSpeed(visualVelocity, distance),
    sameDirectionSpeed(handoffVelocity, distance),
  );
  return {
    startSpeed,
    cruiseSpeed: Math.max(Math.abs(intentSpeed), startSpeed),
  };
};
