import { describe, expect, it } from "vitest";

import { EDGE_DOT_RESTING_OPACITY } from "../../defaults";
import { buildPaginationWidgetGeometry } from "../spatialField";
import { dotOpacityAt, projectDot, writeDotProjection } from "../projection";

/**
 * Invariants of the widget's opacity field (see dotOpacityAt). The pivotal
 * one is handover symmetry: the leaving and arriving edge dots must be
 * mirror images at every instant of a step. A serialized handover (one dies,
 * THEN the other is born) reads as a blink at the edge of the strip.
 */

const CENTER = 2; // visibleDots = 5

describe("dotOpacityAt", () => {
  it("keeps every resting look: interior full, edge slot at resting, beyond gone", () => {
    expect(dotOpacityAt(0, CENTER)).toBe(1);
    expect(dotOpacityAt(1, CENTER)).toBe(1);
    expect(dotOpacityAt(CENTER, CENTER)).toBeCloseTo(
      EDGE_DOT_RESTING_OPACITY,
      10,
    );
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
          dotOpacityAt(center + f, center) +
            dotOpacityAt(center + 1 - f, center),
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

/**
 * Everything about a projected dot EXCEPT its opacity, which the block above
 * already holds: where it sits, how big it is, and whether it is the active
 * one. None of that was pinned — the x placement alone carries three separate
 * branches and eighteen surviving mutants.
 */
describe("writeDotProjection — where a dot sits", () => {
  const SPATIAL = { size: 24, gap: 30, scaleFactor: 0.585 };
  const geometry = buildPaginationWidgetGeometry(5, SPATIAL);
  const { strip, centerIndex, unit, visibleCount } = geometry;

  it("puts a dot exactly on its slot when the strip is at rest", () => {
    // Offset 0 means the deck is on page 0, so id 0 is the centre dot and its
    // neighbours land on the strip positions the geometry computed.
    for (let step = -centerIndex; step <= centerIndex; step += 1) {
      expect(projectDot(step, 0, geometry).x).toBeCloseTo(
        strip[centerIndex + step]!,
        10,
      );
    }
  });

  it("interpolates between two slots while the deck is between pages", () => {
    // Half a page along, a dot sits exactly half-way between the slot it is
    // leaving and the one it is entering — that is what makes the strip glide
    // instead of stepping.
    const half = projectDot(0, 0.5, geometry).x;
    expect(half).toBeCloseTo(
      (strip[centerIndex]! + strip[centerIndex - 1]!) / 2,
      10,
    );
  });

  it("drifts a dot that has run off the left of the strip, without leaping", () => {
    // Off-strip dots are not clamped to the edge (they would pile up on top of
    // each other) and not extrapolated linearly (they would fly away). They
    // ease out by at most one drift unit.
    const limit = unit * 0.6; // EDGE_DOT_DRIFT_FACTOR
    const justOff = projectDot(-centerIndex - 1, 0, geometry).x;
    const farOff = projectDot(-centerIndex - 40, 0, geometry).x;

    expect(justOff).toBeLessThan(strip[0]!);
    expect(farOff).toBeLessThan(justOff);
    // The limit is asymptotic — the drift approaches it and, in floats,
    // reaches it. What must never happen is passing it.
    expect(farOff).toBeGreaterThanOrEqual(strip[0]! - limit);
    expect(farOff).toBeCloseTo(strip[0]! - limit, 6);
  });

  it("drifts a dot off the right the same way, mirrored", () => {
    const limit = unit * 0.6;
    const last = strip[visibleCount - 1]!;
    const justOff = projectDot(centerIndex + 1, 0, geometry).x;
    const farOff = projectDot(centerIndex + 40, 0, geometry).x;

    expect(justOff).toBeGreaterThan(last);
    expect(farOff).toBeGreaterThan(justOff);
    expect(farOff).toBeLessThanOrEqual(last + limit);
    expect(farOff).toBeCloseTo(last + limit, 6);
  });

  it("keeps the drift continuous with the strip it leaves", () => {
    // The seam between "on the strip" and "drifting" must not jump: at the
    // exact edge both readings have to agree.
    const atEdge = projectDot(-centerIndex, 0, geometry).x;
    const aHairOff = projectDot(-centerIndex, 1e-9, geometry).x;
    expect(aHairOff).toBeCloseTo(atEdge, 6);
  });
});

describe("writeDotProjection — how big a dot is and which one is active", () => {
  const geometry = buildPaginationWidgetGeometry(5, {
    size: 24,
    gap: 30,
    scaleFactor: 0.585,
  });
  const { scales, centerIndex } = geometry;

  it("takes the scale of the slot it rests on", () => {
    expect(projectDot(0, 0, geometry).scale).toBeCloseTo(
      scales[centerIndex]!,
      10,
    );
    expect(projectDot(1, 0, geometry).scale).toBeCloseTo(
      scales[centerIndex + 1]!,
      10,
    );
  });

  it("interpolates the scale between slots, so nothing snaps size", () => {
    const half = projectDot(1, 0.5, geometry).scale;
    const lower = scales[centerIndex]!;
    const upper = scales[centerIndex + 1]!;
    expect(half).toBeCloseTo((lower + upper) / 2, 10);
  });

  it("shrinks a dot to nothing once it is off the strip", () => {
    // There is no scale beyond the strip, and reading a missing one as 1 would
    // park a full-size dot outside the widget.
    expect(projectDot(-centerIndex - 2, 0, geometry).scale).toBe(0);
    expect(projectDot(centerIndex + 2, 0, geometry).scale).toBe(0);
  });

  it("gives the active strength to the dot the deck is nearest, and none further out", () => {
    // The overlay reads this: a strength that never reaches 1, or that leaks
    // past one page, smears the active marker across two dots.
    expect(projectDot(0, 0, geometry).activeStrength).toBe(1);
    expect(projectDot(0, 0.5, geometry).activeStrength).toBeCloseTo(0.5, 10);
    expect(projectDot(0, 1, geometry).activeStrength).toBe(0);
    expect(projectDot(0, 3, geometry).activeStrength).toBe(0);
  });

  it("calls exactly one dot active, and switches at the half-way point", () => {
    // `isActive` is a rounding, not a range: two active dots at once would
    // show the marker twice.
    expect(projectDot(0, 0.49, geometry).isActive).toBe(true);
    expect(projectDot(1, 0.49, geometry).isActive).toBe(false);

    expect(projectDot(0, 0.51, geometry).isActive).toBe(false);
    expect(projectDot(1, 0.51, geometry).isActive).toBe(true);
  });

  it("writes into the target it was given rather than allocating", () => {
    // The binding reuses one state object per dot, every frame of every ride.
    const target = projectDot(0, 0, geometry);
    const returned = writeDotProjection(target, 2, 1, geometry);

    expect(returned).toBe(target);
    expect(target.id).toBe(2);
  });
});
