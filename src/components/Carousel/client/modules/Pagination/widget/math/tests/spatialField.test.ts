import { describe, expect, it } from "vitest";

import {
  buildPaginationWidgetGeometry,
  widgetProjectionSide,
  widgetProjectionSlotCount,
} from "../spatialField";

/**
 * The strip the widget's dots are laid out on — and it had no test at all.
 *
 * The dots shrink towards the edges, so their CENTRES cannot be evenly spaced:
 * a constant centre-to-centre step would leave the small dots swimming in air
 * while the big ones crowd. What must stay constant is the gap between their
 * EDGES, which is why each step is the configured gap plus half of each
 * neighbour's own diameter. That one property is what the whole build exists
 * to produce, and every assertion below is a face of it.
 */

const SPATIAL = { size: 24, gap: 30, scaleFactor: 0.585 };

/** The visible gap between two neighbouring dots, edge to edge. */
const edgeGap = (
  strip: readonly number[],
  scales: readonly number[],
  index: number,
) =>
  strip[index]! -
  (SPATIAL.size * scales[index]!) / 2 -
  (strip[index - 1]! + (SPATIAL.size * scales[index - 1]!) / 2);

describe("buildPaginationWidgetGeometry — the strip", () => {
  it("puts the centre dot at the origin", () => {
    // Everything else is measured from it, and the projection reads the strip
    // directly: an off-centre origin shifts the whole widget under the deck.
    const { strip, centerIndex } = buildPaginationWidgetGeometry(5, SPATIAL);
    expect(strip[centerIndex]).toBe(0);
  });

  it("keeps the same gap between every pair of neighbours, edge to edge", () => {
    // The point of the whole build. Dots differ in size across the strip, so
    // equal centre spacing would show as uneven air between them.
    const { strip, scales } = buildPaginationWidgetGeometry(5, SPATIAL);

    for (let index = 1; index < strip.length; index += 1) {
      expect(edgeGap(strip, scales, index)).toBeCloseTo(SPATIAL.gap, 10);
    }
  });

  it("runs left to right without ever doubling back", () => {
    const { strip } = buildPaginationWidgetGeometry(7, SPATIAL);
    for (let index = 1; index < strip.length; index += 1) {
      expect(strip[index]!).toBeGreaterThan(strip[index - 1]!);
    }
  });

  it("is a mirror image around the centre on an odd strip", () => {
    // Built outwards in two loops, one per direction: a sign slip in either
    // would tilt the strip without breaking anything else.
    const { strip, centerIndex } = buildPaginationWidgetGeometry(7, SPATIAL);
    for (let step = 1; step <= centerIndex; step += 1) {
      expect(strip[centerIndex - step]!).toBeCloseTo(
        -strip[centerIndex + step]!,
        10,
      );
    }
  });

  it("holds the gap on an EVEN strip, which has no true middle", () => {
    // `centerIndex` is `floor(n / 2)`, so an even strip leans one slot to the
    // right. That is allowed; uneven air between the dots is not.
    const { strip, scales, centerIndex } = buildPaginationWidgetGeometry(
      6,
      SPATIAL,
    );

    expect(centerIndex).toBe(3);
    expect(strip[centerIndex]).toBe(0);
    for (let index = 1; index < strip.length; index += 1) {
      expect(edgeGap(strip, scales, index)).toBeCloseTo(SPATIAL.gap, 10);
    }
  });
});

describe("buildPaginationWidgetGeometry — the scales", () => {
  it("shrinks by a constant factor per step away from the centre", () => {
    const { scales, centerIndex } = buildPaginationWidgetGeometry(7, SPATIAL);

    expect(scales[centerIndex]).toBe(1);
    for (let step = 1; centerIndex + step < scales.length; step += 1) {
      const expected = SPATIAL.scaleFactor ** step;
      expect(scales[centerIndex + step]!).toBeCloseTo(expected, 10);
      expect(scales[centerIndex - step]!).toBeCloseTo(expected, 10);
    }
  });

  it("gives a single-dot strip one full-size dot at the origin", () => {
    const { strip, scales, centerIndex } = buildPaginationWidgetGeometry(
      1,
      SPATIAL,
    );

    expect(centerIndex).toBe(0);
    expect(scales).toEqual([1]);
    expect(strip).toEqual([0]);
  });
});

describe("buildPaginationWidgetGeometry — the unit and the projection window", () => {
  it("calls one dot plus one gap a unit", () => {
    // The unit is what the projection drifts an off-strip dot by, so it has to
    // mean "one slot of travel", not "one dot".
    const { unit } = buildPaginationWidgetGeometry(5, SPATIAL);
    expect(unit).toBe(SPATIAL.size + SPATIAL.gap);
  });

  it("projects a window WIDER than the strip it draws", () => {
    // Dots have to exist before they slide in and after they slide out, or
    // they pop into being at the edge instead of drifting in.
    for (const visible of [1, 4, 5, 6, 7]) {
      expect(widgetProjectionSide(visible)).toBe(Math.ceil(visible / 2));
      expect(widgetProjectionSlotCount(visible)).toBe(
        widgetProjectionSide(visible) * 2 + 1,
      );
      expect(widgetProjectionSlotCount(visible)).toBeGreaterThan(visible);
    }
  });
});
