import { describe, expect, it } from "vitest";

import { buildInitialState } from "../initial";
import type { CarouselState } from "../types";
import {
  type CarouselStateIssue,
  validateCarouselState,
} from "../validateState";
import { makeLayout, NON_JUMP_PHASES } from "./layoutBuilder";

const layout = makeLayout(12, 3, false); // pageCount 4
const baseState: CarouselState = buildInitialState(layout);

const validate = (
  overrides: Partial<CarouselState> = {},
  state: CarouselState = baseState,
): CarouselStateIssue[] => validateCarouselState({ ...state, ...overrides });

const kinds = (issues: CarouselStateIssue[]): string[] =>
  issues.map((issue) => issue.kind).sort();

describe("validateCarouselState вЂ” valid states", () => {
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

describe("validateCarouselState вЂ” out-of-bounds targetPageIndex", () => {
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

describe("validateCarouselState вЂ” teleportVirtualIndex phase consistency", () => {
  // One table instead of two hand-picked phases: the rule is "any phase that
  // is not step-jump", so the test says exactly that.
  it("flags it in every phase that is not step-jump", () => {
    for (const motionPhase of NON_JUMP_PHASES) {
      const issues = validate({ teleportVirtualIndex: 12, motionPhase });
      expect(issues, motionPhase).toHaveLength(1);
      expect(issues[0]!.kind, motionPhase).toBe(
        "teleport-virtual-index-outside-step-jump",
      );
    }
  });
});

describe("validateCarouselState вЂ” isTeleportApproach phase consistency", () => {
  it("flags it in every phase that is not step-jump", () => {
    for (const motionPhase of NON_JUMP_PHASES) {
      const issues = validate({ isTeleportApproach: true, motionPhase });
      expect(issues, motionPhase).toHaveLength(1);
      expect(issues[0]!.kind, motionPhase).toBe(
        "teleport-approach-outside-step-jump",
      );
    }
  });
});

describe("validateCarouselState вЂ” multiple issues", () => {
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
