import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { CarouselLayout } from "../domain";
import type { Slide } from "../public-api/types";
import { buildInitialState } from "./initial";
import type { CarouselState } from "./types";
import {
  type CarouselStateIssue,
  validateCarouselState,
} from "./validateState";

const makeLayout = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: i,
    content: `slide-${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visibleSlidesCount, isFinite);
};

const layout = makeLayout(12, 3, false); // pageCount 4
const baseState: CarouselState = buildInitialState(layout);

const validate = (
  overrides: Partial<CarouselState> = {},
  state: CarouselState = baseState,
): CarouselStateIssue[] => validateCarouselState({ ...state, ...overrides });

const kinds = (issues: CarouselStateIssue[]): string[] =>
  issues.map((issue) => issue.kind).sort();

describe("validateCarouselState — valid states", () => {
  it("returns no issues for a freshly built initial state", () => {
    expect(validate()).toEqual([]);
  });

  it("returns no issues for a step-jump with teleportVirtualIndex set", () => {
    expect(
      validate({
        motionPhase: "step-jump",
        teleportVirtualIndex: 15,
        targetPageIndex: 2,
        virtualIndex: 6,
      }),
    ).toEqual([]);
  });

  it("returns no issues for an in-flight teleport-approach in step-jump", () => {
    expect(
      validate({
        motionPhase: "step-jump",
        isTeleportApproach: true,
        targetPageIndex: 3,
      }),
    ).toEqual([]);
  });
});

describe("validateCarouselState — out-of-bounds targetPageIndex", () => {
  it("flags a negative targetPageIndex", () => {
    const issues = validate({ targetPageIndex: -1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "out-of-bounds-target-page-index",
      field: "targetPageIndex",
      actual: -1,
    });
  });

  it("flags a targetPageIndex equal to pageCount", () => {
    const issues = validate({ targetPageIndex: layout.pageCount });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "out-of-bounds-target-page-index",
      field: "targetPageIndex",
      actual: layout.pageCount,
    });
  });

  it("does not flag a state reconciled against an empty deck (vacuously valid)", () => {
    const emptyLayout = makeLayout(0, 3, false);
    expect(emptyLayout.pageCount).toBe(0);
    const emptyState = buildInitialState(emptyLayout);
    expect(emptyState.layout).toBe(emptyLayout);
    expect(validateCarouselState(emptyState)).toEqual([]);
  });
});

describe("validateCarouselState — teleportVirtualIndex phase consistency", () => {
  it("flags teleportVirtualIndex set in the idle phase", () => {
    const issues = validate({ teleportVirtualIndex: 12 });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("teleport-virtual-index-outside-step-jump");
  });

  it("flags teleportVirtualIndex set during a step-normal segment", () => {
    const issues = validate({
      teleportVirtualIndex: 12,
      motionPhase: "step-normal",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("teleport-virtual-index-outside-step-jump");
  });
});

describe("validateCarouselState — isTeleportApproach phase consistency", () => {
  it("flags isTeleportApproach set in the idle phase", () => {
    const issues = validate({ isTeleportApproach: true });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("teleport-approach-outside-step-jump");
  });

  it("flags isTeleportApproach set during a step-snap segment", () => {
    const issues = validate({
      isTeleportApproach: true,
      motionPhase: "step-snap",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("teleport-approach-outside-step-jump");
  });
});

describe("validateCarouselState — multiple issues", () => {
  it("collects every independent violation", () => {
    const issues = validate({
      targetPageIndex: -1,
      teleportVirtualIndex: 12,
      isTeleportApproach: true,
    });
    expect(kinds(issues)).toEqual([
      "out-of-bounds-target-page-index",
      "teleport-approach-outside-step-jump",
      "teleport-virtual-index-outside-step-jump",
    ]);
  });
});
