import { describe, expect, it } from "vitest";

import { parseBezier, sampleBezier } from "../../../motion/bezier";
import { buildPaginationWidgetGeometry } from "./spatialField";
import { projectDot } from "./projection";
import { buildProjectionKeyframes, fixedIdAt } from "./keyframes";
import { PAGINATION_WIDGET_DEFAULTS } from "../defaults";

const geometry = buildPaginationWidgetGeometry(
  PAGINATION_WIDGET_DEFAULTS.visibleDots,
  {
    size: PAGINATION_WIDGET_DEFAULTS.dotSize,
    gap: PAGINATION_WIDGET_DEFAULTS.dotGap,
    scaleFactor: PAGINATION_WIDGET_DEFAULTS.scaleFactor,
  },
);

const LINEAR = parseBezier("linear");
const EASE = parseBezier("cubic-bezier(0.28, 0.72, 0.38, 1)");

describe("buildProjectionKeyframes (fixed id)", () => {
  it("first and last keyframes sit at time-progress 0 and 1", () => {
    const kf = buildProjectionKeyframes(fixedIdAt(0), 0, 3, EASE, geometry, 16);
    expect(kf[0]!.offset).toBe(0);
    expect(kf.at(-1)!.offset).toBe(1);
    expect(kf).toHaveLength(17);
  });

  it("endpoints equal the direct projection at from/to offsets", () => {
    const from = 0;
    const to = 4;
    const kf = buildProjectionKeyframes(fixedIdAt(1), from, to, EASE, geometry, 24);
    const atFrom = projectDot(1, from, geometry);
    const atTo = projectDot(1, to, geometry);
    expect(kf[0]!.x).toBeCloseTo(atFrom.x, 6);
    expect(kf[0]!.scale).toBeCloseTo(atFrom.scale, 6);
    expect(kf[0]!.opacity).toBeCloseTo(atFrom.opacity, 6);
    expect(kf.at(-1)!.x).toBeCloseTo(atTo.x, 6);
    expect(kf.at(-1)!.scale).toBeCloseTo(atTo.scale, 6);
    expect(kf.at(-1)!.activeStrength).toBeCloseTo(atTo.activeStrength, 6);
  });

  it("each keyframe equals the projection at its eased deck offset (visual fidelity)", () => {
    const from = 2;
    const to = 5;
    const steps = 20;
    const kf = buildProjectionKeyframes(fixedIdAt(3), from, to, EASE, geometry, steps);
    for (let i = 0; i <= steps; i += 1) {
      const p = i / steps;
      const easedOffset = from + (to - from) * sampleBezier(EASE, p).progress;
      const expected = projectDot(3, easedOffset, geometry);
      expect(kf[i]!.x).toBeCloseTo(expected.x, 6);
      expect(kf[i]!.scale).toBeCloseTo(expected.scale, 6);
      expect(kf[i]!.opacity).toBeCloseTo(expected.opacity, 6);
      expect(kf[i]!.activeStrength).toBeCloseTo(expected.activeStrength, 6);
    }
  });

  it("a linear easing samples the deck offset uniformly", () => {
    const kf = buildProjectionKeyframes(fixedIdAt(0), 0, 2, LINEAR, geometry, 4);
    const mid = projectDot(0, 1, geometry);
    expect(kf[2]!.x).toBeCloseTo(mid.x, 6);
  });

  it("clamps degenerate step counts to at least one interval", () => {
    const kf = buildProjectionKeyframes(fixedIdAt(0), 0, 1, EASE, geometry, 0);
    expect(kf).toHaveLength(2);
    expect(kf[0]!.offset).toBe(0);
    expect(kf[1]!.offset).toBe(1);
  });
});

describe("fixed page-dot identity continuity", () => {
  it("a fixed-id trajectory is continuous across an integer crossing (no teleport)", () => {
    // The recycling model teleported a node's id at .5 crossings, which WAAPI
    // would interpolate into a lurch. A fixed id must vary smoothly: adjacent
    // dense samples stay within a small delta with no jump.
    const kf = buildProjectionKeyframes(fixedIdAt(2), 0, 4, LINEAR, geometry, 200);
    let maxJump = 0;
    for (let i = 1; i < kf.length; i += 1) {
      maxJump = Math.max(maxJump, Math.abs(kf[i]!.x - kf[i - 1]!.x));
    }
    // Over a 4-page sweep in 200 steps, the largest single-step x change stays
    // well under one dot unit — i.e. no discontinuity.
    expect(maxJump).toBeLessThan(geometry.unit * 0.5);
  });

  it("active glow peaks (=1) exactly when the deck offset reaches the dot's page", () => {
    const kf = buildProjectionKeyframes(fixedIdAt(2), 0, 4, LINEAR, geometry, 200);
    const peak = kf.reduce((m, s) => Math.max(m, s.activeStrength), 0);
    expect(peak).toBeCloseTo(1, 3);
  });
});
