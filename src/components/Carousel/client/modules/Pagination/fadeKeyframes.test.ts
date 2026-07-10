import { describe, expect, it } from "vitest";

import { buildFadeKeyframes, type DotVisualState } from "./fadeKeyframes";

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
