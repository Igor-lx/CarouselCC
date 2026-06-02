import { describe, expect, it } from "vitest";

import { parseBezier, sampleBezier } from "../../../motion/bezier";
import { buildPaginationWidgetGeometry } from "./spatialField";
import { projectDot } from "./projection";
import {
  activeIdAt,
  buildProjectionKeyframes,
  fixedIdAt,
  slotIdAt,
} from "./keyframes";
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

describe("recycling id resolvers", () => {
  const side = 3;

  it("slotIdAt recycles a slot's id as the deck crosses half-integers", () => {
    const slot0 = slotIdAt(0, side);
    expect(slot0(0)).toBe(0 - side); // round(0) - side
    expect(slot0(0.4)).toBe(0 - side); // still rounds to 0
    expect(slot0(0.6)).toBe(1 - side); // rounds to 1 -> id steps +1
    expect(slot0(2)).toBe(2 - side);
  });

  it("activeIdAt tracks floor/ceil of the offset", () => {
    expect(activeIdAt(0)(2.3)).toBe(2);
    expect(activeIdAt(1)(2.3)).toBe(3);
    expect(activeIdAt(0)(4)).toBe(4);
    expect(activeIdAt(1)(4)).toBe(4);
  });

  it("a recycling slot's baked endpoints match the per-frame slot projection", () => {
    // Slot keyframes must agree with the per-frame model AT the endpoints (where
    // the id is settled); the interior recycle is a sub-frame slide by design.
    const from = 0;
    const to = 3;
    const kf = buildProjectionKeyframes(slotIdAt(4, side), from, to, LINEAR, geometry, 60);
    const idFrom = Math.round(from) - side + 4;
    const idTo = Math.round(to) - side + 4;
    expect(kf[0]!.x).toBeCloseTo(projectDot(idFrom, from, geometry).x, 6);
    expect(kf.at(-1)!.x).toBeCloseTo(projectDot(idTo, to, geometry).x, 6);
  });
});
