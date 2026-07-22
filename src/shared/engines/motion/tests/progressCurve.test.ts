import { describe, expect, it } from "vitest";

import { buildProfile, sampleMotionProfile } from "../profile/profile";
import {
  resolveProgressStopIntervals,
  resampleStops,
  profileProgressStops,
  resolvePeakSpeedForDuration,
  sampleProgressStops,
  keyframesAlongStops,
  positionAtNow,
} from "../profile/progressCurve";

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

describe("positionAtNow", () => {
  const span = { from: 2, to: 4, duration: 1000, startedAt: 10_000, stops: [0, 0.5, 1] };

  it("reads the span's own curve, endpoints exact", () => {
    expect(positionAtNow(span, 10_000)).toBe(2);
    expect(positionAtNow(span, 10_500)).toBeCloseTo(3, 10);
    expect(positionAtNow(span, 11_000)).toBe(4);
  });

  it("clamps outside the window and treats a degenerate duration as finished", () => {
    expect(positionAtNow(span, 9_000)).toBe(2);
    expect(positionAtNow(span, 12_000)).toBe(4);
    expect(positionAtNow({ ...span, duration: 0 }, 10_000)).toBe(4);
  });
});

describe("keyframesAlongStops", () => {
  it("evaluates the caller's domain at the position each stop reaches", () => {
    const frames = keyframesAlongStops(10, 20, [0, 0.25, 1], (position) => position * 2);
    expect(frames).toEqual([20, 25, 40]);
  });

  it("supports a reversed span and a single-stop degenerate curve", () => {
    expect(keyframesAlongStops(5, 3, [0, 1], (p) => p)).toEqual([5, 3]);
    expect(keyframesAlongStops(1, 1, [0, 1], (p) => p)).toEqual([1, 1]);
  });
});

/**
 * Serialization DENSITY. The compositor interpolates linearly between stops,
 * so velocity is piecewise-constant and jumps at each one. What the eye reads
 * is the SIZE of that jump relative to the speed it is tracking — a quantity
 * that is dimensionless in time. So the density is derived from the profile's
 * own shape, and the answer is a stop COUNT that does not move with the
 * duration, and does not encode a display refresh rate.
 */
describe("progress-stop density follows the profile's shape", () => {
  it("is the same count whatever the ride lasts", () => {
    const counts = [300, 800, 1300, 2000, 3000, 4000].map((duration) =>
      resolveProgressStopIntervals(stepProfile({ a: 0.35, d: 0.4 }, 0, duration)),
    );
    // Identical up to the ceil() rounding of one interval — the criterion is
    // dimensionless in time, so duration must not move the answer.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("rises when the launch gets sharper — the only thing that changed", () => {
    const soft = resolveProgressStopIntervals(stepProfile({ a: 0.45, d: 0.4 }));
    const sharp = resolveProgressStopIntervals(stepProfile({ a: 0.1, d: 0.4 }));
    expect(sharp).toBeGreaterThan(soft);
  });

  it("keeps a floor for degenerate profiles", () => {
    expect(
      resolveProgressStopIntervals({ duration: 0, endSpeed: 0, zones: [] }),
    ).toBe(32);
    expect(
      resolveProgressStopIntervals({ duration: 500, endSpeed: 0, zones: [] }),
    ).toBe(32);
  });

  it("is denser than the old fixed 32 for a real button ride", () => {
    // The regression this guards: at 32 intervals a 2 s ride's relative
    // velocity jump reached ~15%, above the ~10% smooth-pursuit vision reads.
    expect(resolveProgressStopIntervals(stepProfile())).toBeGreaterThan(32);
    expect(profileProgressStops(stepProfile(), 3).length).toBeGreaterThan(33);
  });

  it("velocity steps between consecutive segments stay small", () => {
    const profile = stepProfile();
    const stops = profileProgressStops(profile, 3);
    const speeds = stops.slice(1).map((stop, i) => stop - stops[i]!);
    const peak = Math.max(...speeds);
    const jumps = speeds
      .slice(1)
      .map((speed, i) => Math.abs(speed - speeds[i]!) / peak);
    expect(Math.max(...jumps)).toBeLessThan(0.05);
  });
});

describe("resampleStops — a coarser grid on the same curve", () => {
  it("returns the requested interval count, exact at both ends", () => {
    const dense = profileProgressStops(stepProfile(), 3);
    const coarse = resampleStops(dense, 32);
    expect(coarse).toHaveLength(33);
    expect(coarse[0]).toBe(0);
    expect(coarse[coarse.length - 1]).toBe(1);
  });

  it("stays on the same curve (matches the dense read at the same instants)", () => {
    const dense = profileProgressStops(stepProfile(), 3);
    const coarse = resampleStops(dense, 32);
    for (let i = 0; i <= 32; i += 1) {
      const t = i / 32;
      expect(coarse[i]!).toBeCloseTo(sampleProgressStops(dense, t), 6);
    }
  });

  it("never upsamples — an already-coarse array is returned as is", () => {
    const short = [0, 0.5, 1];
    expect(resampleStops(short, 32)).toEqual(short);
  });

  it("stays monotonic", () => {
    const coarse = resampleStops(profileProgressStops(stepProfile(), 3), 16);
    for (let i = 1; i < coarse.length; i += 1) {
      expect(coarse[i]!).toBeGreaterThanOrEqual(coarse[i - 1]!);
    }
  });
});
