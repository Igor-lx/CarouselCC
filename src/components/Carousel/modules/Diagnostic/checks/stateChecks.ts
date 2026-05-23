import type { CarouselDiagnosticContextValue } from "../../../context";
import { validateCarouselState } from "../../../state/validateState";
import type { CarouselDiagnosticWarning } from "../types";

const STATE_LAYER = "State";

/**
 * Reducer / effective-state structural invariants. The validator is pure and
 * lives with the state machine; Diagnostic only translates issues to warnings.
 */
export const collectStateWarnings = (
  state: CarouselDiagnosticContextValue["state"],
): CarouselDiagnosticWarning[] =>
  validateCarouselState(state, state.layout).map((issue) => ({
    severity: "CRITICAL",
    layer: STATE_LAYER,
    field: issue.field,
    actual: issue.actual,
    expected: issue.expected,
    consequence: issue.consequence,
  }));
