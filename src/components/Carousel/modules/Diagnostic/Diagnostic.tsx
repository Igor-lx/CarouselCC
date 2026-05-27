import { memo, useEffect, useMemo } from "react";

import { traceCarousel } from "../../debug/performanceTrace";
import { useCarouselDiagnosticContext } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import {
  collectConstantWarnings,
  collectLayoutWarnings,
  collectPropWarnings,
  collectSlotWarnings,
  collectStateWarnings,
} from "./checks";
import type { CarouselDiagnosticWarning } from "./types";
import { useGroupedWarnings } from "./useGroupedWarnings";

const BANNER =
  "[Carousel Diagnostic] enabled. Observe-only: diagnostics reports runtime values and explicit runtime normalizations.";

const DiagnosticBase = memo(function CarouselDiagnostic() {
  const { state, props, layout, slots } = useCarouselDiagnosticContext();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info(BANNER);
  }, []);

  const warnings = useMemo<CarouselDiagnosticWarning[]>(() => {
    const startedAt = performance.now();
    const next = [
      ...collectPropWarnings(props),
      ...collectConstantWarnings(),
      ...collectLayoutWarnings(layout),
      ...collectSlotWarnings(slots),
      ...collectStateWarnings(state),
    ];
    traceCarousel("diagnostic:collect", {
      duration: performance.now() - startedAt,
      warnings: next.length,
    });
    return next;
  }, [layout, props, slots, state]);

  useGroupedWarnings(warnings);

  return null;
});

export const Diagnostic: CarouselSlotComponent<typeof DiagnosticBase, "diagnostic"> =
  Object.assign(DiagnosticBase, { slot: "diagnostic" as const });

export default Diagnostic;
