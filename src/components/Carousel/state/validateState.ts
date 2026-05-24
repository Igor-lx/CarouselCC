import type { CarouselState } from "./types";

/**
 * Structural-invariant violations on a reducer-output / effective-state
 * snapshot. The reducer is a pure function and does not consult this
 * validator; the `<Diagnostic />` slot does, surfacing each violation as a
 * DEV-only warning through the shared warning pipeline.
 *
 * `kind` is the machine-readable discriminator (tests assert against it);
 * `field` names the single state field at fault; the remaining strings carry
 * human-readable context for the diagnostic line.
 */
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

/**
 * Pure validator. Returns an empty array when the state is structurally
 * sound; one entry per violation otherwise. No `console`, no `throw`, no
 * side effects — the reducer can stay pure across every environment. The
 * Diagnostic slot maps these issues to warnings.
 *
 * The single-argument shape is intentional: the effective `CarouselState`
 * already owns the `layout` it was reconciled against, so `state.layout` is
 * the only correct frame of reference. A second `layout` parameter would
 * invite a `state.layout !== layout` mismatch (the validator silently judging
 * state against a layout it never agreed with) and is removed.
 *
 * The invariants guarded here are:
 * - `targetPageIndex` is inside `[0, pageCount)`;
 * - `teleportVirtualIndex` is non-null only inside the `step-jump` phase;
 * - `isTeleportApproach` is true only inside the `step-jump` phase.
 */
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
