import type { CarouselDiagnosticContextValue } from "../../../context";
import {
  validateCarouselState,
  type CarouselStateIssue,
} from "../../../state/validateState";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "State";

/**
 * Structural state violations are always `CRITICAL`: they describe a state
 * the reducer should physically never produce, and downstream layers
 * (segment factory, render window, navigation) will misbehave on them.
 */
const issueToWarning = (issue: CarouselStateIssue): CarouselDiagnosticWarning => ({
  severity: "CRITICAL",
  layer: LAYER,
  field: issue.field,
  actual: issue.actual,
  expected: issue.expected,
  consequence: issue.consequence,
});

/**
 * Adapter between the pure `validateCarouselState` and the diagnostic warning
 * pipeline. Runs only when a `<Diagnostic />` slot is attached — the reducer
 * itself stays pure across every environment. The full effective state
 * already carries its own `layout`, so the validator gets `(state, state.layout)`
 * here rather than threading a second sub-view through context.
 */
export const collectStateWarnings = (
  state: CarouselDiagnosticContextValue["state"],
): CarouselDiagnosticWarning[] =>
  validateCarouselState(state, state.layout).map(issueToWarning);
