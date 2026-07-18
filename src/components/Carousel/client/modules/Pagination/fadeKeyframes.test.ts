import { describe, expect, it } from "vitest";

import {
  buildFadeKeyframes,
  buildPulseKeyframes,
  type DotVisualState,
} from "./fadeKeyframes";

const INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };

describe("buildFadeKeyframes", () => {
  it("emits one keyframe per stop, endpoints exactly at from/to", () => {
    const frames = buildFadeKeyframes(INACTIVE, ACTIVE, [0, 0.25, 0.6, 1]);
    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual({ opacity: 0.2, transform: "scaleX(1)" });
    expect(frames[3]).toEqual({ opacity: 0.8, transform: "scaleX(1.4)" });
  });

  it("blends both channels linearly by distance progress", () => {
    const frames = buildFadeKeyframes(INACTIVE, ACTIVE, [0, 0.5, 1]);
    expect(frames[1]!.opacity).toBeCloseTo(0.5, 10);
    expect(frames[1]!.transform).toBe(`scaleX(${1 + 0.4 * 0.5})`);
  });

  it("keeps monotonic stops monotonic in opacity (fade never reverses)", () => {
    const stops = [0, 0.1, 0.35, 0.7, 0.9, 1];
    const frames = buildFadeKeyframes(INACTIVE, ACTIVE, stops);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]!.opacity).toBeGreaterThanOrEqual(frames[i - 1]!.opacity);
    }
  });

  it("supports the reverse direction (active -> inactive)", () => {
    const frames = buildFadeKeyframes(ACTIVE, INACTIVE, [0, 1]);
    expect(frames[0]!.opacity).toBeCloseTo(0.8, 10);
    expect(frames[1]!.opacity).toBeCloseTo(0.2, 10);
    expect(frames[1]!.transform).toBe("scaleX(1)");
  });
});

/**
 * The retarget pulse: a dot caught mid-rise still rides its whole cycle —
 * on up to the active look, then back to resting — so a repeated click reads
 * as "this page was passed through" instead of a twitch.
 */
describe("buildPulseKeyframes", () => {
  /** Where the dot had got to when the repeated command landed. */
  const CAUGHT_MID_RISE: DotVisualState = { opacity: 0.35, scale: 1.1 };

  it("starts where the dot actually is, peaks at active, ends at resting", () => {
    const frames = buildPulseKeyframes(CAUGHT_MID_RISE, ACTIVE, INACTIVE, [0, 0.5, 1]);
    expect(frames[0]).toEqual({ opacity: 0.35, transform: "scaleX(1.1)" });
    const last = frames[frames.length - 1]!;
    expect(last.opacity).toBeCloseTo(0.2, 10);
    expect(last.transform).toBe("scaleX(1)");
  });

  it("puts the peak exactly at the midpoint (halves stay evenly distributed)", () => {
    const stops = [0, 0.5, 1];
    const frames = buildPulseKeyframes(CAUGHT_MID_RISE, ACTIVE, INACTIVE, stops);
    // 3 rise frames + 2 fall frames (the duplicated peak is dropped) = 5.
    expect(frames).toHaveLength(2 * stops.length - 1);
    const middle = (frames.length - 1) / 2;
    expect(Number.isInteger(middle)).toBe(true);
    expect(frames[middle]).toEqual({ opacity: 0.8, transform: "scaleX(1.4)" });
  });

  it("rises then falls — the active look is actually reached, not approached", () => {
    const frames = buildPulseKeyframes(CAUGHT_MID_RISE, ACTIVE, INACTIVE, [0, 0.5, 1]);
    const peak = (frames.length - 1) / 2;
    for (let i = 1; i <= peak; i += 1) {
      expect(frames[i]!.opacity).toBeGreaterThanOrEqual(frames[i - 1]!.opacity);
    }
    for (let i = peak + 1; i < frames.length; i += 1) {
      expect(frames[i]!.opacity).toBeLessThanOrEqual(frames[i - 1]!.opacity);
    }
    expect(Math.max(...frames.map((f) => f.opacity))).toBeCloseTo(0.8, 10);
  });

  it("never emits a duplicate frame at the seam", () => {
    const frames = buildPulseKeyframes(CAUGHT_MID_RISE, ACTIVE, INACTIVE, [0, 0.25, 1]);
    const peak = (frames.length - 1) / 2;
    expect(frames[peak]).not.toEqual(frames[peak + 1]);
  });
});
