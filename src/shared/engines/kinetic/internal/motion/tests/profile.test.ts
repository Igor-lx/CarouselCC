/**
 * FORK of `shared/engines/motion/tests/profile.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { describe, expect, it } from "vitest";

import {
  buildProfile,
  createMotionProfile,
  sampleMotionProfile,
} from "../profile/profile";

describe("createMotionProfile", () => {
  it("produces a positive duration and ordered zones for a normal accel/cruise/decel", () => {
    const profile = createMotionProfile({
      distance: 300,
      startSpeed: 0,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(profile.duration).toBeGreaterThan(0);
    expect(profile.zones.length).toBe(3);
    // zones are laid out contiguously in distance-progress space.
    expect(profile.zones[0]!.startDistanceProgress).toBeCloseTo(0);
    expect(
      profile.zones[profile.zones.length - 1]!.endDistanceProgress,
    ).toBeCloseTo(1);
  });

  it("drops zero-share zones (pure deceleration profile keeps one zone)", () => {
    const profile = createMotionProfile({
      distance: 300,
      startSpeed: 1,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 1,
    });
    expect(profile.zones.length).toBe(1);
    expect(profile.duration).toBeGreaterThan(0);
  });

  it("raises the resolved peak to cover start/end speeds", () => {
    // peakSpeed below startSpeed must not invert the profile.
    const profile = createMotionProfile({
      distance: 100,
      startSpeed: 5,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 1,
    });
    expect(profile.duration).toBeGreaterThan(0);
    expect(Number.isFinite(profile.duration)).toBe(true);
  });
});

describe("sampleMotionProfile", () => {
  const profile = buildProfile({
    from: 0,
    to: 300,
    startSpeed: 0,
    peakSpeed: 1,
    endSpeed: 0,
    accelerationDistanceShare: 0.3,
    decelerationDistanceShare: 0.3,
  });

  it("starts at zero distance-progress", () => {
    const sample = sampleMotionProfile(profile, 0, 300);
    expect(sample.distanceProgress).toBeCloseTo(0);
  });

  it("completes at full distance-progress once elapsed reaches the duration", () => {
    const sample = sampleMotionProfile(profile, profile.duration, 300);
    expect(sample.distanceProgress).toBe(1);
  });

  it("clamps an over-elapsed sample to full progress", () => {
    const sample = sampleMotionProfile(profile, profile.duration * 5, 300);
    expect(sample.distanceProgress).toBe(1);
  });

  it("advances monotonically through the segment", () => {
    let previous = -1;
    for (let t = 0; t <= profile.duration; t += profile.duration / 12) {
      const { distanceProgress } = sampleMotionProfile(profile, t, 300);
      expect(distanceProgress).toBeGreaterThanOrEqual(previous);
      previous = distanceProgress;
    }
  });
});
