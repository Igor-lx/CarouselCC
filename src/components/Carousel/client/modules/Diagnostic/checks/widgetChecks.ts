import { isFiniteNumber } from "../../../../../../shared";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "PaginationWidget";

const isPositiveFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isNonNegativeFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isOddIntegerAtLeastThree = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 3 && value % 2 === 1;

export interface WidgetDiagnosticInput {
  visibleDots: unknown;
  dotSize: unknown;
  dotGap: unknown;
  scaleFactor: unknown;
}

/**
 * Audit PaginationWidget props. Each entry fires when the *resolved* value
 * (default-substituted if `undefined`) is out of its expected domain. The
 * runtime uses the same value either way — Diagnostics only describes it.
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

  if (!(isFiniteNumber(input.scaleFactor) && input.scaleFactor > 0 && input.scaleFactor <= 1)) {
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
