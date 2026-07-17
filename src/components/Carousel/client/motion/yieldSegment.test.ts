import { describe, expect, it } from "vitest";

import { sampleCarouselSegment } from "./sampler";
import { buildBrakeSegment, buildResumeSegment } from "./yieldSegment";

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
  const shares = { accelerationDistanceShare: 0.35, decelerationDistanceShare: 0.4 };

  it("accelerates from the crawl back to the pre-brake cruise and arrives at zero", () => {
    const segment = buildResumeSegment({
      ...base,
      position: 3,
      velocity: 0.0006,
      cruiseSpeed: 0.004,
      shares,
    });
    expect(segment).not.toBeNull();
    expect(segment!.to).toBe(4);
    expect(segment!.strategy).toBe("step");

    const launch = sampleCarouselSegment(segment!, 10_000);
    expect(launch.velocity).toBeCloseTo(0.0006, 10);

    // Mid-cruise the ride is back at the captured pre-brake speed.
    const mid = sampleCarouselSegment(segment!, 10_000 + segment!.duration * 0.5);
    expect(Math.abs(mid.velocity)).toBeCloseTo(0.004, 10);

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
        shares,
      }),
    ).toBeNull();
  });
});
