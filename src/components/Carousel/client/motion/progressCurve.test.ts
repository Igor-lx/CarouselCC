import { describe, expect, it } from "vitest";

import { buildProfile, sampleMotionProfile } from "./profile";
import {
  profileProgressStops,
  resolvePeakSpeedForDuration,
  sampleProgressStops,
  stopsToLinearEasing,
} from "./progressCurve";

const stepProfile = (shares = { a: 0.35, d: 0.4 }, startSpeed = 0, duration = 2000) => {
  const peak = resolvePeakSpeedForDuration({
    distance: 3,
    duration,
    startSpeed,
    accelerationDistanceShare: shares.a,
    decelerationDistanceShare: shares.d,
  });
  return buildProfile({
    from: 0,
    to: 3,
    startSpeed,
    peakSpeed: peak,
    endSpeed: 0,
    accelerationDistanceShare: shares.a,
    decelerationDistanceShare: shares.d,
  });
};

describe("resolvePeakSpeedForDuration", () => {
  it("derives a peak that makes the profile cover the distance in the duration", () => {
    for (const shares of [
      { a: 0.35, d: 0.4 },
      { a: 0.1, d: 0.6 },
      { a: 0.08, d: 0.7 },
      { a: 0, d: 1 },
      { a: 0.5, d: 0.5 },
    ]) {
      const profile = stepProfile(shares, 0, 2000);
      expect(profile.duration).toBeCloseTo(2000, 6);
    }
  });

  it("honours a non-zero handed-off start speed", () => {
    const cruise = 3 / 2000; // average speed of the zero-start case
    const profile = stepProfile({ a: 0.35, d: 0.4 }, cruise * 0.5, 2000);
    expect(profile.duration).toBeCloseTo(2000, 6);
    expect(profile.zones[0]!.startSpeed).toBeCloseTo(cruise * 0.5, 9);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(
      resolvePeakSpeedForDuration({
        distance: 0,
        duration: 2000,
        startSpeed: 0,
        accelerationDistanceShare: 0.3,
        decelerationDistanceShare: 0.3,
      }),
    ).toBe(0);
    expect(
      resolvePeakSpeedForDuration({
        distance: 3,
        duration: 0,
        startSpeed: 0,
        accelerationDistanceShare: 0.3,
        decelerationDistanceShare: 0.3,
      }),
    ).toBe(0);
  });
});

describe("profileProgressStops", () => {
  it("starts at exactly 0, ends at exactly 1, and is monotonic", () => {
    const stops = profileProgressStops(stepProfile(), 3);
    expect(stops[0]).toBe(0);
    expect(stops[stops.length - 1]).toBe(1);
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i]!).toBeGreaterThanOrEqual(stops[i - 1]!);
    }
  });

  it("front-loads progress for a front-loaded profile", () => {
    const frontLoaded = profileProgressStops(stepProfile({ a: 0.05, d: 0.7 }), 3);
    const mid = frontLoaded[Math.floor(frontLoaded.length / 2)]!;
    // Half the time elapsed -> well past half the distance.
    expect(mid).toBeGreaterThan(0.55);
  });

  it("degenerates to [0, 1] for a zero-duration profile", () => {
    const profile = buildProfile({
      from: 0,
      to: 0,
      startSpeed: 0,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(profileProgressStops(profile, 0)).toEqual([0, 1]);
  });
});

describe("stopsToLinearEasing", () => {
  it("serialises uniform stops into a linear() list", () => {
    expect(stopsToLinearEasing([0, 0.25, 1])).toBe("linear(0, 0.25, 1)");
  });

  it("rounds to four decimals", () => {
    expect(stopsToLinearEasing([0, 0.123456, 1])).toBe("linear(0, 0.1235, 1)");
  });
});

describe("sampleProgressStops", () => {
  const stops = [0, 0.1, 0.5, 1];

  it("returns exact values at stop positions", () => {
    expect(sampleProgressStops(stops, 0)).toBe(0);
    expect(sampleProgressStops(stops, 1 / 3)).toBeCloseTo(0.1, 9);
    expect(sampleProgressStops(stops, 1)).toBe(1);
  });

  it("interpolates linearly between stops", () => {
    // halfway between stops[1] (t=1/3) and stops[2] (t=2/3)
    expect(sampleProgressStops(stops, 0.5)).toBeCloseTo(0.3, 9);
  });

  it("clamps out-of-range time fractions", () => {
    expect(sampleProgressStops(stops, -1)).toBe(0);
    expect(sampleProgressStops(stops, 2)).toBe(1);
  });

  it("agrees with the exact profile sampler within the interpolation error", () => {
    const profile = stepProfile();
    const stopsFromProfile = profileProgressStops(profile, 3);
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      const approx = sampleProgressStops(stopsFromProfile, fraction);
      const exact = sampleMotionProfile(
        profile,
        profile.duration * fraction,
        3,
      ).distanceProgress;
      expect(Math.abs(approx - exact)).toBeLessThan(0.01);
    }
  });
});
