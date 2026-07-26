// See docs/architecture/state.md — pure structural-invariant validator; the
// reducer never consults it, the dev Diagnostic slot does.
import type { CarouselState } from "./types";

export type CarouselStateIssueKind =
  | "out-of-bounds-target-page-index"
  | "teleport-virtual-index-outside-step-jump"
  | "teleport-approach-outside-step-jump";

export type CarouselStateIssueField =
  | "targetPageIndex"
  | "teleportVirtualIndex"
  | "isTeleportApproach";

export interface CarouselStateIssue {
  readonly kind: CarouselStateIssueKind;
  readonly field: CarouselStateIssueField;
  readonly actual: unknown;
  readonly expected: string;
  readonly consequence: string;
}

// Single argument by design: the state owns the layout it was reconciled
// against, so a second `layout` param could not disagree with it.
export const validateCarouselState = (
  state: CarouselState,
): CarouselStateIssue[] => {
  const { layout } = state;
  const issues: CarouselStateIssue[] = [];

  if (
    layout.pageCount > 0 &&
    (state.targetPageIndex < 0 || state.targetPageIndex >= layout.pageCount)
  ) {
    issues.push({
      kind: "out-of-bounds-target-page-index",
      field: "targetPageIndex",
      actual: state.targetPageIndex,
      expected: `Expected 0 <= targetPageIndex < pageCount (${layout.pageCount})`,
      consequence:
        "Pagination indexing, render-window math, and onCarouselStatusChange will operate on an invalid page",
    });
  }

  if (state.teleportVirtualIndex !== null && state.motionPhase !== "step-jump") {
    issues.push({
      kind: "teleport-virtual-index-outside-step-jump",
      field: "teleportVirtualIndex",
      actual: {
        teleportVirtualIndex: state.teleportVirtualIndex,
        motionPhase: state.motionPhase,
      },
      expected:
        'Expected teleportVirtualIndex to be non-null only when motionPhase === "step-jump"',
      consequence:
        "Motion settlement may interpret this as a pending far-GO_TO teleport in the wrong phase",
    });
  }

  if (state.isTeleportApproach && state.motionPhase !== "step-jump") {
    issues.push({
      kind: "teleport-approach-outside-step-jump",
      field: "isTeleportApproach",
      actual: {
        isTeleportApproach: state.isTeleportApproach,
        motionPhase: state.motionPhase,
      },
      expected:
        'Expected isTeleportApproach to be true only when motionPhase === "step-jump"',
      consequence:
        "Motion segment planning may build a teleport-approach profile in the wrong phase",
    });
  }

  return issues;
};
