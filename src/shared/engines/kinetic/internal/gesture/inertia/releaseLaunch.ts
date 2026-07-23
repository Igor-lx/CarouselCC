import { sameDirectionSpeed } from "./speed";

/**
 * The CONTINUITY LAUNCH policy of a gesture release (etalon scroll physics):
 * the ride starts at the velocity the eye SAW at lift-off and accelerates to
 * the intent speed — content never jumps above its visible speed.
 *
 * - `visualVelocity` — the continuity speed judged over the whole gesture
 *   (pause-protected), the value a launch SHOULD start from;
 * - `handoffVelocity` — a SECOND carried-velocity source; `startSpeed` is the
 *   larger aligned of the two, so whichever better reflects the live motion
 *   wins. It is the velocity of an already-running motion the release takes
 *   over (an in-flight takeover); a consumer may also pass the deck's raw
 *   release velocity here for a plain drag, so a fast instantaneous lift-off
 *   is honoured even when the gesture-averaged `visualVelocity` is lower. Zero
 *   means "no second source";
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
