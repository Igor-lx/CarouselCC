import { describe, expect, it } from "vitest";

import { buildProfile } from "../profile/profile";
import {
  alignSpeed,
  createProfileSegment,
  sampleProfileSegment,
} from "../profile/profileSegment";

const profile = buildProfile({
  from: 2,
  to: 6,
  startSpeed: 0,
  peakSpeed: 0.004,
  endSpeed: 0,
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.4,
});

const segment = createProfileSegment({
  strategy: "ride",
  from: 2,
  to: 6,
  profile,
  startedAt: 10_000,
});

describe("createProfileSegment", () => {
  it("takes its duration from the profile — no second source to disagree", () => {
    expect(segment.duration).toBe(profile.duration);
    expect(segment.profile).toBe(profile);
  });

  it("stamps startedAt with the motion clock when omitted", () => {
    const auto = createProfileSegment({
      strategy: "x",
      from: 0,
      to: 1,
      profile,
    });
    expect(Number.isFinite(auto.startedAt)).toBe(true);
  });
});

describe("sampleProfileSegment", () => {
  it("starts exactly at from with the profile's launch speed", () => {
    const sample = sampleProfileSegment(segment, 10_000);
    expect(sample.value).toBe(2);
    expect(sample.progress).toBe(0);
    expect(sample.target).toBe(6);
    expect(sample.strategy).toBe("ride");
  });

  it("advances monotonically and signs velocity along the travel", () => {
    let previous = 2;
    for (let i = 1; i <= 10; i += 1) {
      const t = 10_000 + (segment.duration * i) / 10;
      const sample = sampleProfileSegment(segment, t);
      expect(sample.value).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(sample.velocity).toBeGreaterThanOrEqual(0);
      previous = sample.value;
    }
  });

  it("reports the exact endpoint past the duration (settle contract)", () => {
    const done = sampleProfileSegment(segment, 10_000 + segment.duration + 50);
    expect(done.progress).toBe(1);
    expect(done.value).toBe(6);
  });

  it("signs velocity negative for backward travel", () => {
    const back = createProfileSegment({
      strategy: "ride",
      from: 6,
      to: 2,
      profile: buildProfile({
        from: 6,
        to: 2,
        startSpeed: 0,
        peakSpeed: 0.004,
        endSpeed: 0,
        accelerationDistanceShare: 0.3,
        decelerationDistanceShare: 0.4,
      }),
      startedAt: 0,
    });
    const mid = sampleProfileSegment(back, back.duration / 2);
    expect(mid.velocity).toBeLessThan(0);
    expect(mid.value).toBeLessThan(6);
  });

  it("treats a degenerate (zero-distance) segment as immediately settled", () => {
    const still = createProfileSegment({
      strategy: "ride",
      from: 3,
      to: 3,
      profile: buildProfile({
        from: 3,
        to: 3,
        startSpeed: 0,
        peakSpeed: 0.004,
        endSpeed: 0,
        accelerationDistanceShare: 0.3,
        decelerationDistanceShare: 0.4,
      }),
      startedAt: 0,
    });
    expect(sampleProfileSegment(still, 0).progress).toBe(1);
    expect(sampleProfileSegment(still, 0).value).toBe(3);
  });
});

describe("alignSpeed", () => {
  it("keeps a velocity that helps the travel, as an unsigned speed", () => {
    expect(alignSpeed(0.003, 5)).toBe(0.003);
    expect(alignSpeed(-0.003, -5)).toBe(0.003);
  });

  it("drops an opposing or degenerate velocity to a standing start", () => {
    expect(alignSpeed(-0.003, 5)).toBe(0);
    expect(alignSpeed(0.003, -5)).toBe(0);
    expect(alignSpeed(0.003, 0)).toBe(0);
    expect(alignSpeed(Number.NaN, 5)).toBe(0);
  });
});
