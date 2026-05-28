import type { CarouselDiagnosticContextValue } from "../../../context";
import {
  validateCarouselState,
  type CarouselStateIssue,
} from "../../../state/validateState";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "State";

const issueToWarning = (issue: CarouselStateIssue): CarouselDiagnosticWarning => ({
  severity: "CRITICAL",
  layer: LAYER,
  field: issue.field,
  actual: issue.actual,
  expected: issue.expected,
  consequence: issue.consequence,
});

export const collectStateWarnings = (
  state: CarouselDiagnosticContextValue["state"],
): CarouselDiagnosticWarning[] =>
  validateCarouselState(state).map(issueToWarning);
