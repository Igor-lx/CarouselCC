import type { CarouselLayout } from "../domain";
import type { CarouselState } from "./types";

export type CarouselStateIssueCode =
  | "target-page-out-of-bounds"
  | "teleport-target-outside-jump"
  | "teleport-approach-outside-jump";

export interface CarouselStateIssue {
  code: CarouselStateIssueCode;
  field: "targetPageIndex" | "teleportVirtualIndex" | "isTeleportApproach";
  actual: unknown;
  expected: string;
  consequence: string;
}

/**
 * Pure structural validation for reducer output / effective state snapshots.
 * It never logs, repairs, normalizes, or feeds values back into runtime.
 */
export const validateCarouselState = (
  state: CarouselState,
  layout: CarouselLayout,
): CarouselStateIssue[] => {
  const issues: CarouselStateIssue[] = [];

  if (
    layout.pageCount > 0 &&
    (state.targetPageIndex < 0 || state.targetPageIndex >= layout.pageCount)
  ) {
    issues.push({
      code: "target-page-out-of-bounds",
      field: "targetPageIndex",
      actual: state.targetPageIndex,
      expected: `Expected targetPageIndex to be within [0, ${
        layout.pageCount - 1
      }]`,
      consequence:
        "Navigation state points outside the current page range; pagination and motion targets can diverge",
    });
  }

  if (state.teleportVirtualIndex !== null && state.motionPhase !== "step-jump") {
    issues.push({
      code: "teleport-target-outside-jump",
      field: "teleportVirtualIndex",
      actual: {
        teleportVirtualIndex: state.teleportVirtualIndex,
        motionPhase: state.motionPhase,
      },
      expected:
        "Expected teleportVirtualIndex to be set only during the step-jump phase",
      consequence:
        "A pending GO_TO teleport can be consumed by the wrong motion phase",
    });
  }

  if (state.isTeleportApproach && state.motionPhase !== "step-jump") {
    issues.push({
      code: "teleport-approach-outside-jump",
      field: "isTeleportApproach",
      actual: {
        isTeleportApproach: state.isTeleportApproach,
        motionPhase: state.motionPhase,
      },
      expected:
        "Expected isTeleportApproach to be true only during the step-jump phase",
      consequence:
        "The GO_TO approach segment can be treated as active after jump motion has ended",
    });
  }

  return issues;
};
