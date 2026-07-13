import { isPositiveInteger } from "../../../../../../shared";
import type { ResponsiveImagesProps } from "../../ResponsiveImages/types";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "ResponsiveImages";

/** The module's tunable props, values widened to `unknown` — Diagnostics
 * audits the raw values; keying on the props type keeps the audit in
 * lockstep with the module's surface. */
export type ResponsiveImagesDiagnosticInput = {
  [K in keyof Pick<
    ResponsiveImagesProps,
    "preloadPagesNr" | "isPreloadOn" | "isPredecodeOn"
  >]-?: unknown;
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

  // The types forbid this combination; the runtime check covers untyped
  // call sites (predecode is an upgrade of the warm — it cannot run with
  // the master switch off, decoding without fetching is not a thing).
  if (input.isPreloadOn === false && input.isPredecodeOn === true) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "isPredecodeOn",
      actual: true,
      expected: "isPreloadOn must be on for isPredecodeOn to have any effect",
      consequence: "Predecode is silently dead: the warm master switch is off",
    });
  }

  return out;
};
