import { isPositiveInteger } from "../../../../../../shared";
import type { ResponsiveImagesProps } from "../../ResponsiveImages/types";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "ResponsiveImages";

/** The module's tunable props, values widened to `unknown` — Diagnostics
 * audits the raw values; keying on the props type keeps the audit in
 * lockstep with the module's surface. */
export type ResponsiveImagesDiagnosticInput = {
  [K in keyof Pick<ResponsiveImagesProps, "preloadPagesNr">]-?: unknown;
};

export const collectResponsiveImagesWarnings = (
  input: ResponsiveImagesDiagnosticInput,
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (input.preloadPagesNr !== undefined && !isPositiveInteger(input.preloadPagesNr)) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "preloadPagesNr",
      actual: input.preloadPagesNr,
      expected: "Expected a positive finite integer (pages per side)",
      consequence: "Neighbour-page preloading warms nothing",
    });
  }

  return out;
};
