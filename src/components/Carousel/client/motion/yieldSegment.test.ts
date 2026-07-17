import { describe, expect, it } from "vitest";

import { createMotionProfile } from "../../../../shared";
import { sampleCarouselSegment } from "./sampler";
import {
  buildBrakeSegment,
  buildResumeSegment,
  profileSpeedAtDistanceProgress,
} from "./yieldSegment";

/**
 * Yield re-timings are velocity-continuous replacements of an in-flight ride:
 * same destination, same strategy, new temporal curve. Structural guards are
 * sign checks (no magnitude thresholds); knob values here are pinned test
 * inputs — the mechanism must hold for any legitimate settings.
 */

const settings = { crawlSpeedShare: 0.15, brakeDurationMs: 200 };

const base = {
  position: 2.4,
  velocity: 0.004,
  target: 4,
  strategy: "step" as const,
  startedAt: 10_000,
};

describe("buildBrakeSegment", () => {
  it("re-times the ride to the same destination with the same strategy", () => {
    const brake = buildBrakeSegment({ ...base, settings });
    expect(brake).not.toBeNull();
    expect(brake!.segment.from).toBe(2.4);
    expect(brake!.segment.to).toBe(4);
    expect(brake!.segment.strategy).toBe("step");
    expect(brake!.segment.startedAt).toBe(10_000);
    expect(brake!.entrySpeed).toBe(0.004);
  });

  it("launches velocity-continuously and decays to a crawl proportional to the live speed", () => {
    const brake = buildBrakeSegment({ ...base, settings });
    const early = sampleCarouselSegment(brake!.segment, 10_000);
    expect(early.value).toBeCloseTo(2.4, 10);
    expect(early.velocity).toBeCloseTo(0.004, 10);

    const cruising = sampleCarouselSegment(
      brake!.segment,
      10_000 + brake!.segment.duration * 0.9,
    );
    expect(Math.abs(cruising.velocity)).toBeCloseTo(0.004 * 0.15, 10);
    expect(cruising.target).toBe(4);
  });

  it("carries direction for a backward ride", () => {
    const brake = buildBrakeSegment({
      ...base,
      velocity: -0.004,
      target: 1,
      settings,
    });
    expect(brake).not.toBeNull();
    const mid = sampleCarouselSegment(brake!.segment, 10_000 + 100);
    expect(mid.velocity).toBeLessThan(0);
    expect(mid.value).toBeLessThan(2.4);
  });

  it("returns null when the velocity does not point at the remaining distance", () => {
    // A turnaround instant / opposite drift: no coherent motion to brake.
    expect(buildBrakeSegment({ ...base, velocity: -0.004, settings })).toBeNull();
    expect(buildBrakeSegment({ ...base, velocity: 0, settings })).toBeNull();
  });

  it("returns null when the ride has effectively arrived", () => {
    expect(
      buildBrakeSegment({ ...base, position: 4, target: 4, settings }),
    ).toBeNull();
  });
});

describe("buildResumeSegment", () => {
  const resumeSettings = {
    resumeRampDurationMs: 300,
    resumeDecelerationDistanceShare: 0.4,
  };

  it("ramps from the crawl back to the cruise within the time budget and arrives at zero", () => {
    // Remaining span large enough for a real cruise plateau (with a small
    // remainder the ramp and the arrival legitimately consume everything).
    const segment = buildResumeSegment({
      ...base,
      position: 1,
      velocity: 0.0006,
      cruiseSpeed: 0.004,
      settings: resumeSettings,
    });
    expect(segment).not.toBeNull();
    expect(segment!.to).toBe(4);
    expect(segment!.strategy).toBe("step");

    const launch = sampleCarouselSegment(segment!, 10_000);
    expect(launch.velocity).toBeCloseTo(0.0006, 10);

    // The ramp is TIME-authored: shortly past the budget the ride is back at
    // the cruise, however much distance remains.
    const afterRamp = sampleCarouselSegment(segment!, 10_000 + 320);
    expect(Math.abs(afterRamp.velocity)).toBeCloseTo(0.004, 10);

    const arrival = sampleCarouselSegment(segment!, 10_000 + segment!.duration + 1);
    expect(arrival.value).toBe(4);
    expect(arrival.progress).toBe(1);
  });

  it("returns null when nothing remains to travel", () => {
    expect(
      buildResumeSegment({
        ...base,
        position: 4,
        velocity: 0.0006,
        cruiseSpeed: 0.004,
        settings: resumeSettings,
      }),
    ).toBeNull();
  });
});

describe("profileSpeedAtDistanceProgress", () => {
  // A front-loaded profile (autoplay-like): short accel, long decel — the
  // shape where "return to the speed the brake sampled" goes wrong.
  const profile = createMotionProfile({
    distance: 1,
    startSpeed: 0,
    peakSpeed: 0.004,
    endSpeed: 0,
    accelerationDistanceShare: 0.1,
    decelerationDistanceShare: 0.6,
  });

  it("prescribes the cruise speed inside the cruise zone", () => {
    expect(profileSpeedAtDistanceProgress(profile, 1, 0.2)).toBeCloseTo(0.004, 6);
  });

  it("prescribes a decayed speed deep in the deceleration tail", () => {
    const tail = profileSpeedAtDistanceProgress(profile, 1, 0.9);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(0.004 * 0.75);
  });

  it("is monotonic across the deceleration tail", () => {
    const early = profileSpeedAtDistanceProgress(profile, 1, 0.5);
    const late = profileSpeedAtDistanceProgress(profile, 1, 0.95);
    expect(late).toBeLessThan(early);
  });
});
