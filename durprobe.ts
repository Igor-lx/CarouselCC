import { resolvePeakSpeedForDuration, buildProfile } from "./src/shared";
import {
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
} from "./src/components/Carousel/client/config/motion";

const a = STEP_ACCELERATION_DISTANCE_SHARE;
const d = STEP_DECELERATION_DISTANCE_SHARE;
console.log("step shares: accel", a, "decel", d, "cruise", 1 - a - d);

for (const [distance, duration, s0] of [
  [3, 2000, 0],
  [1, 2000, 0],
  [3, 2000, 0.0005],
] as const) {
  const peak = resolvePeakSpeedForDuration({
    distance, duration, startSpeed: s0,
    accelerationDistanceShare: a, decelerationDistanceShare: d,
  });
  const profile = buildProfile({
    from: 0, to: distance, startSpeed: s0, peakSpeed: peak, endSpeed: 0,
    accelerationDistanceShare: a, decelerationDistanceShare: d,
  });
  console.log(
    `D=${distance} requested=${duration}ms s0=${s0} -> peak=${peak.toFixed(6)} actual=${profile.duration.toFixed(1)}ms ratio=${(profile.duration / duration).toFixed(4)}`,
  );
  profile.zones.forEach((z, i) =>
    console.log(`    zone${i} distShare=${(z.endDistanceProgress - z.startDistanceProgress).toFixed(3)} t=${z.startTime.toFixed(1)}..${(z.startTime + z.duration).toFixed(1)} v=${z.startSpeed.toFixed(6)}->${z.endSpeed.toFixed(6)}`),
  );
}
