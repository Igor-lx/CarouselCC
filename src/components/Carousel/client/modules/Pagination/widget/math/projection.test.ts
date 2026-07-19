import { describe, expect, it } from "vitest";

import { EDGE_DOT_RESTING_OPACITY } from "../defaults";
import { buildPaginationWidgetGeometry } from "./spatialField";
import { dotOpacityAt, projectDot } from "./projection";

/**
 * Invariants of the widget's opacity field (see dotOpacityAt). The pivotal
 * one is handover symmetry: the leaving and arriving edge dots must be
 * mirror images at every instant of a step — the serialized handover (one
 * dies, THEN the other is born) was a reported, measured bug.
 */

const CENTER = 2; // visibleDots = 5

describe("dotOpacityAt", () => {
  it("keeps every resting look: interior full, edge slot at resting, beyond gone", () => {
    expect(dotOpacityAt(0, CENTER)).toBe(1);
    expect(dotOpacityAt(1, CENTER)).toBe(1);
    expect(dotOpacityAt(CENTER, CENTER)).toBeCloseTo(EDGE_DOT_RESTING_OPACITY, 10);
    expect(dotOpacityAt(CENTER + 1, CENTER)).toBe(0);
    expect(dotOpacityAt(CENTER + 3, CENTER)).toBe(0);
  });

  it("matches the previous field exactly on the inner half (no look change inside)", () => {
    // The old band was 1 - (d - (c - 0.5)) for d in [c-0.5, c+0.5]; inside
    // the edge slot the new field must be the same curve.
    for (const d of [1.5, 1.6, 1.75, 1.9, 2]) {
      expect(dotOpacityAt(d, CENTER)).toBeCloseTo(1 - (d - (CENTER - 0.5)), 10);
    }
  });

  /** THE invariant: one full step of handover, perfectly counter-phased. */
  it("handover pair sums to the resting opacity at every instant", () => {
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const leaving = dotOpacityAt(CENTER + f, CENTER);
      const arriving = dotOpacityAt(CENTER + 1 - f, CENTER);
      expect(leaving + arriving).toBeCloseTo(EDGE_DOT_RESTING_OPACITY, 10);
    }
  });

  it("is monotonically non-increasing in distance", () => {
    let previous = Infinity;
    for (let d = 0; d <= CENTER + 1.5; d += 0.1) {
      const value = dotOpacityAt(d, CENTER);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
  });

  it("holds the symmetry under other window sizes (structural, not tuned to 5)", () => {
    for (const center of [1, 3, 4]) {
      for (let f = 0; f <= 1.0001; f += 0.25) {
        expect(
          dotOpacityAt(center + f, center) + dotOpacityAt(center + 1 - f, center),
        ).toBeCloseTo(EDGE_DOT_RESTING_OPACITY, 10);
      }
    }
  });
});

describe("projectDot opacity wiring", () => {
  const geometry = buildPaginationWidgetGeometry(5, {
    size: 24,
    gap: 30,
    scaleFactor: 0.585,
  });

  it("projects the field through the full dot state", () => {
    expect(projectDot(2, 0, geometry).opacity).toBeCloseTo(
      EDGE_DOT_RESTING_OPACITY,
      10,
    );
    expect(projectDot(3, 0, geometry).opacity).toBe(0);
    // Mid-handover: the leaving edge dot (distance 2.5) is exactly half-gone…
    expect(projectDot(-2, 0.5, geometry).opacity).toBeCloseTo(
      EDGE_DOT_RESTING_OPACITY / 2,
      10,
    );
    // …and the arriving one (distance 2.5 from the other side) half-born.
    expect(projectDot(3, 0.5, geometry).opacity).toBeCloseTo(
      EDGE_DOT_RESTING_OPACITY / 2,
      10,
    );
  });
});
