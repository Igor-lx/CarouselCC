import { describe, expect, it } from "vitest";

import { sampleCarouselSegment } from "./sampler";
import { buildBrakeSegment, buildResumeSegment } from "./yieldSegment";

/**
 * Yield re-timings are velocity-continuous replacements of an in-flight ride:
 * same destination, same strategy, new temporal curve. Dive/exit ramp
 * durations are PROPORTIONAL to the ride's own duration; structural guards
 * are sign checks (no magnitude thresholds). Knobs here are pinned test
 * inputs — the mechanism must hold for any legitimate settings.
 */

const brakeSettings = { crawlSpeedShare: 0.25, entryDurationShare: 0.2 };
const resumeSettings = { exitDurationShare: 0.2, arrivalDecelerationDistanceShare: 0.4 };

const base = {
  position: 2.4,
  velocity: 0.004,
  target: 4,
  strategy: "step" as const,
  startedAt: 10_000,
  rideDurationMs: 1000,
};

describe("buildBrakeSegment", () => {
  it("re-times the ride to the same destination with the same strategy", () => {
    const brake = buildBrakeSegment({ ...base, settings: brakeSettings });
    expect(brake).not.toBeNull();
    expect(brake!.segment.from).toBe(2.4);
    expect(brake!.segment.to).toBe(4);
    expect(brake!.segment.strategy).toBe("step");
    expect(brake!.segment.startedAt).toBe(10_000);
    expect(brake!.entrySpeed).toBe(0.004);
  });

  it("launches velocity-continuously and decays to a crawl proportional to the live speed", () => {
    const brake = buildBrakeSegment({ ...base, settings: brakeSettings });
    const early = sampleCarouselSegment(brake!.segment, 10_000);
    expect(early.value).toBeCloseTo(2.4, 10);
    expect(early.velocity).toBeCloseTo(0.004, 10);

    const cruising = sampleCarouselSegment(
      brake!.segment,
      10_000 + brake!.segment.duration * 0.95,
    );
    expect(Math.abs(cruising.velocity)).toBeCloseTo(0.004 * 0.25, 10);
    expect(cruising.target).toBe(4);
  });

  it("dive ramp duration scales with the ride's own tempo (proportional, not absolute)", () => {
    // The dive ramp is the first zone; its duration = entryDurationShare ×
    // rideDurationMs, so doubling the ride tempo doubles the dive.
    const fast = buildBrakeSegment({ ...base, rideDurationMs: 500, settings: brakeSettings });
    const slow = buildBrakeSegment({ ...base, rideDurationMs: 1000, settings: brakeSettings });
    const fastRamp = fast!.segment.profile.zones[0]!.duration;
    const slowRamp = slow!.segment.profile.zones[0]!.duration;
    expect(fastRamp).toBeCloseTo(0.2 * 500, 6);
    expect(slowRamp).toBeCloseTo(0.2 * 1000, 6);
    expect(slowRamp / fastRamp).toBeCloseTo(2, 6);
  });

  it("carries direction for a backward ride", () => {
    const brake = buildBrakeSegment({
      ...base,
      velocity: -0.004,
      target: 1,
      settings: brakeSettings,
    });
    expect(brake).not.toBeNull();
    const mid = sampleCarouselSegment(brake!.segment, 10_000 + 40);
    expect(mid.velocity).toBeLessThan(0);
    expect(mid.value).toBeLessThan(2.4);
  });

  it("returns null when the velocity does not point at the remaining distance", () => {
    expect(
      buildBrakeSegment({ ...base, velocity: -0.004, settings: brakeSettings }),
    ).toBeNull();
    expect(buildBrakeSegment({ ...base, velocity: 0, settings: brakeSettings })).toBeNull();
  });

  it("returns null when the ride has effectively arrived", () => {
    expect(
      buildBrakeSegment({ ...base, position: 4, target: 4, settings: brakeSettings }),
    ).toBeNull();
  });
});

describe("buildResumeSegment", () => {
  it("ramps from the crawl back to the dive speed within the proportional budget and arrives at zero", () => {
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

    // Exit ramp = exitDurationShare × rideDurationMs = 0.2 × 1000 = 200 ms;
    // shortly past it the ride is back at the dive speed.
    const afterRamp = sampleCarouselSegment(segment!, 10_000 + 220);
    expect(Math.abs(afterRamp.velocity)).toBeCloseTo(0.004, 10);

    const arrival = sampleCarouselSegment(segment!, 10_000 + segment!.duration + 1);
    expect(arrival.value).toBe(4);
    expect(arrival.progress).toBe(1);
  });

  it("exit ramp duration scales with the ride's own tempo", () => {
    const fast = buildResumeSegment({
      ...base,
      position: 1,
      velocity: 0.0006,
      cruiseSpeed: 0.004,
      rideDurationMs: 500,
      settings: resumeSettings,
    });
    const slow = buildResumeSegment({
      ...base,
      position: 1,
      velocity: 0.0006,
      cruiseSpeed: 0.004,
      rideDurationMs: 1000,
      settings: resumeSettings,
    });
    expect(fast!.profile.zones[0]!.duration).toBeCloseTo(0.2 * 500, 6);
    expect(slow!.profile.zones[0]!.duration).toBeCloseTo(0.2 * 1000, 6);
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
