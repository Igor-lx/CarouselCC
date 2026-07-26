import {
  inRangeExclusiveLower,
  isNonNegativeFinite,
  isPositiveFinite,
  isPositiveInteger,
} from "../../../../../../shared";
import type { PaginationWidgetProps } from "../../Pagination/widget/types";
import type { CarouselDiagnosticWarning } from "../types";

// See docs/architecture/diagnostics.md
const LAYER = "PaginationWidget";

// The strip needs a centre dot, hence odd >= 3.
const isOddIntegerAtLeastThree = (value: unknown): value is number =>
  isPositiveInteger(value) && value >= 3 && value % 2 === 1;

const isValidScaleFactor = inRangeExclusiveLower(0, 1);

/** The widget's tunable props widened to `unknown` (audit the RAW caller values);
 * keyed on `PaginationWidgetProps` so a new prop forces an audit decision. */
export type WidgetDiagnosticInput = {
  [K in keyof Omit<PaginationWidgetProps, "className">]-?: unknown;
};

/**
 * Audit PaginationWidget props against their resolved (default-substituted) value.
 */
export const collectWidgetWarnings = (
  input: WidgetDiagnosticInput,
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (!isOddIntegerAtLeastThree(input.visibleDots)) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "visibleDots",
      actual: input.visibleDots,
      expected: "Expected an odd integer >= 3 (5 is the product baseline)",
      consequence:
        "Spatial-field geometry becomes asymmetric and the active dot no longer sits at the centre",
    });
  }

  if (!isPositiveFinite(input.dotSize)) {
    out.push({
      severity: "CRITICAL",
      layer: LAYER,
      field: "dotSize",
      actual: input.dotSize,
      expected: "Expected a positive finite number of pixels",
      consequence: "Dot strip math produces NaN or zero-width dots",
    });
  }

  if (!isNonNegativeFinite(input.dotGap)) {
    out.push({
      severity: "CRITICAL",
      layer: LAYER,
      field: "dotGap",
      actual: input.dotGap,
      expected: "Expected a non-negative finite number of pixels",
      consequence: "Dot strip positions collapse or overlap unexpectedly",
    });
  }

  if (!isValidScaleFactor(input.scaleFactor)) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "scaleFactor",
      actual: input.scaleFactor,
      expected: "Expected a finite number in the range (0, 1]",
      consequence: "Edge-dot scaling either explodes outward or collapses to a single point",
    });
  }

  return out;
};
