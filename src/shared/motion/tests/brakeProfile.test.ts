import { describe, expect, it } from "vitest";

import {
  createBrakeProfile,
  createResumeProfile,
  sampleMotionProfile,
} from "../profile/profile";

/**
 * The yield profiles' contract (see createBrakeProfile / createResumeProfile):
 * an ease-out ramp between the live speed and a crawl within a TIME budget,
 * plus a crawl (brake) or a cruise + arrival (resume). The ramp is ease-out —
 * steepest change at its START — which is the "vinyl brake" responsiveness.
 * Knobs here are pinned test values; the mechanism must hold for any of them.
 */

// Mean-speed fraction of the ease-out ramp: ∫₀¹(2u−u²) = 2/3. The ramp
// distance is duration × (s0 + (s1−s0)·2/3), which is what makes the solved
// zone duration come back out to exactly the requested time budget.
const EASE_OUT_MEAN = 2 / 3;

describe("createBrakeProfile", () => {
  const input = {
    distance: 1,
    startSpeed: 0.004, // units per ms
    crawlSpeed: 0.0006,
    brakeDurationMs: 200,
  };
  const rampDistance =
    input.brakeDurationMs *
    (input.startSpeed + (input.crawlSpeed - input.startSpeed) * EASE_OUT_MEAN);

  it("ramps within the exact time budget, then crawls the rest of the distance", () => {
    const profile = createBrakeProfile(input);

    expect(profile.zones).toHaveLength(2);
    const [ramp, crawl] = profile.zones;
    expect(ramp!.easing).toBe("easeOut");
    expect(ramp!.endDistanceProgress).toBeCloseTo(rampDistance, 10);
    expect(ramp!.duration).toBeCloseTo(200, 6); // the budget, exactly
    expect(ramp!.startSpeed).toBe(0.004);
    expect(ramp!.endSpeed).toBe(0.0006);
    expect(crawl!.startSpeed).toBe(0.0006);
    expect(crawl!.endSpeed).toBe(0.0006);
    expect(crawl!.endDistanceProgress).toBe(1);
    expect(crawl!.duration).toBeCloseTo((1 - rampDistance) / 0.0006, 6);
    expect(profile.endSpeed).toBe(0.0006);
  });

  it("dives front-loaded: more speed is shed in the first half of the ramp than the second", () => {
    const profile = createBrakeProfile(input);
    const s0 = 0.004;
    const half = sampleMotionProfile(profile, 100, 1).speed; // ramp midpoint
    const end = sampleMotionProfile(profile, 200, 1).speed; // ramp end (crawl)
    const shedFirstHalf = s0 - half;
    const shedSecondHalf = half - end;
    expect(shedFirstHalf).toBeGreaterThan(shedSecondHalf);
  });

  it("samples monotonically and slows down over the ramp", () => {
    const profile = createBrakeProfile(input);
    let previousProgress = 0;
    let previousSpeed = Infinity;
    for (let i = 1; i <= 20; i += 1) {
      const t = (200 * i) / 20;
      const sampled = sampleMotionProfile(profile, t, 1);
      expect(sampled.distanceProgress).toBeGreaterThanOrEqual(previousProgress);
      expect(sampled.speed).toBeLessThanOrEqual(previousSpeed + 1e-12);
      previousProgress = sampled.distanceProgress;
      previousSpeed = sampled.speed;
    }
    const late = sampleMotionProfile(profile, profile.duration * 0.9, 1);
    expect(late.speed).toBeCloseTo(0.0006, 10);
  });

  it("uses the whole remaining distance as the ramp when the budget does not fit", () => {
    const profile = createBrakeProfile({ ...input, distance: 0.1 });
    // Ramp distance (≈0.347) exceeds the remaining 0.1 — single ramp zone.
    expect(profile.zones).toHaveLength(1);
    const [ramp] = profile.zones;
    expect(ramp!.endDistanceProgress).toBe(1);
    expect(ramp!.startSpeed).toBe(0.004);
    expect(ramp!.endSpeed).toBe(0.0006);
    expect(profile.duration).toBeLessThan(200);
  });

  it("brake budget 0 is a legitimate instant drop to crawl", () => {
    const profile = createBrakeProfile({ ...input, brakeDurationMs: 0 });
    expect(profile.zones).toHaveLength(1);
    expect(profile.zones[0]!.startSpeed).toBe(0.0006);
    expect(profile.zones[0]!.endSpeed).toBe(0.0006);
    expect(profile.duration).toBeCloseTo(1 / 0.0006, 6);
  });

  it("negative distance uses the absolute span (direction lives outside the profile)", () => {
    const forward = createBrakeProfile(input);
    const backward = createBrakeProfile({ ...input, distance: -1 });
    expect(backward.duration).toBeCloseTo(forward.duration, 10);
    expect(backward.zones).toHaveLength(forward.zones.length);
  });

  it("guards a zero crawl against the divide singularity", () => {
    const profile = createBrakeProfile({ ...input, crawlSpeed: 0 });
    expect(Number.isFinite(profile.duration)).toBe(true);
    expect(profile.duration).toBeGreaterThan(0);
  });
});

describe("createResumeProfile", () => {
  const input = {
    distance: 3,
    startSpeed: 0.0006, // the crawl
    cruiseSpeed: 0.004,
    rampDurationMs: 300,
    decelerationDistanceShare: 0.4,
  };

  it("ramps up within the exact time budget, cruises, then decelerates to zero", () => {
    const profile = createResumeProfile(input);
    expect(profile.zones).toHaveLength(3);
    const [ramp, cruise, decel] = profile.zones;
    expect(ramp!.easing).toBe("easeOut");
    expect(ramp!.startSpeed).toBeCloseTo(0.0006, 10);
    expect(ramp!.endSpeed).toBeCloseTo(0.004, 10);
    expect(ramp!.duration).toBeCloseTo(300, 6); // the budget, exactly
    expect(cruise!.startSpeed).toBeCloseTo(0.004, 10);
    expect(cruise!.endSpeed).toBeCloseTo(0.004, 10);
    expect(decel!.endSpeed).toBe(0);
    expect(decel!.endDistanceProgress).toBe(1);
    expect(profile.endSpeed).toBe(0);
  });

  it("rises front-loaded: more speed regained in the first half of the ramp", () => {
    const profile = createResumeProfile(input);
    const half = sampleMotionProfile(profile, 150, 3).speed;
    const end = sampleMotionProfile(profile, 300, 3).speed;
    const gainedFirstHalf = half - 0.0006;
    const gainedSecondHalf = end - half;
    expect(gainedFirstHalf).toBeGreaterThan(gainedSecondHalf);
  });
});
