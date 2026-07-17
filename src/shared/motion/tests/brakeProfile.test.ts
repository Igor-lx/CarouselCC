import { describe, expect, it } from "vitest";

import { createBrakeProfile, sampleMotionProfile } from "../profile/profile";

/**
 * The brake profile's contract (see createBrakeProfile): ramp from the entry
 * speed to the crawl within the TIME budget, then hold the crawl over the
 * whole remaining distance; when the ramp does not fit, the whole remainder
 * is the ramp. Knobs here are pinned test values — the mechanism must hold
 * for any of them.
 */
describe("createBrakeProfile", () => {
  const input = {
    distance: 1,
    startSpeed: 0.004, // units per ms
    crawlSpeed: 0.0006,
    brakeDurationMs: 200,
  };

  it("ramps within the time budget, then crawls the rest of the distance", () => {
    const profile = createBrakeProfile(input);

    expect(profile.zones).toHaveLength(2);
    const [ramp, crawl] = profile.zones;
    // Ramp distance falls out of the speeds: t * (v + crawl) / 2.
    const rampDistance = 200 * ((0.004 + 0.0006) / 2);
    expect(ramp!.endDistanceProgress).toBeCloseTo(rampDistance / 1, 10);
    expect(ramp!.duration).toBeCloseTo(200, 6);
    expect(ramp!.startSpeed).toBe(0.004);
    expect(ramp!.endSpeed).toBe(0.0006);
    // Crawl covers the remainder at constant crawl speed.
    expect(crawl!.startSpeed).toBe(0.0006);
    expect(crawl!.endSpeed).toBe(0.0006);
    expect(crawl!.endDistanceProgress).toBe(1);
    expect(crawl!.duration).toBeCloseTo((1 - rampDistance) / 0.0006, 6);
    expect(profile.endSpeed).toBe(0.0006);
  });

  it("samples monotonically and slows down over the ramp", () => {
    const profile = createBrakeProfile(input);
    let previousProgress = 0;
    let previousSpeed = Infinity;
    for (let i = 1; i <= 20; i += 1) {
      const t = (200 * i) / 20; // inside the ramp
      const sampled = sampleMotionProfile(profile, t, 1);
      expect(sampled.distanceProgress).toBeGreaterThanOrEqual(previousProgress);
      expect(sampled.speed).toBeLessThanOrEqual(previousSpeed + 1e-12);
      previousProgress = sampled.distanceProgress;
      previousSpeed = sampled.speed;
    }
    // Deep in the crawl the speed IS the crawl.
    const late = sampleMotionProfile(profile, profile.duration * 0.9, 1);
    expect(late.speed).toBeCloseTo(0.0006, 10);
  });

  it("uses the whole remaining distance as the ramp when the budget does not fit", () => {
    const profile = createBrakeProfile({ ...input, distance: 0.1 });
    // Ramp distance (0.46) exceeds the remaining 0.1 — single ramp zone.
    expect(profile.zones).toHaveLength(1);
    const [ramp] = profile.zones;
    expect(ramp!.endDistanceProgress).toBe(1);
    expect(ramp!.startSpeed).toBe(0.004);
    expect(ramp!.endSpeed).toBe(0.0006);
    // Arrives earlier than the budget: less distance to shed speed over.
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
