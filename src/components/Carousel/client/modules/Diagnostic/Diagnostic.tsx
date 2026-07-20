import { memo, useEffect, useMemo, useState } from "react";

import { useCarouselDiagnosticContext, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import {
  collectConstantWarnings,
  collectLayoutWarnings,
  collectPropWarnings,
  collectSlideSourceMediaWarnings,
  collectSlotWarnings,
  collectStateWarnings,
  collectViewportAxisWarnings,
  collectViewportCssWarnings,
} from "./checks";
import type { CarouselDiagnosticWarning } from "./types";
import { useGroupedWarnings } from "./useGroupedWarnings";

const BANNER =
  "[Carousel Diagnostic] enabled. Observe-only: diagnostics reports runtime values and explicit runtime normalizations.";

const DiagnosticBase = memo(function CarouselDiagnostic() {
  const { state, props, layout, slots } = useCarouselDiagnosticContext();
  const { slides } = useCarouselStable();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info(BANNER);
  }, []);

  // Stylesheet-dependent audit runs AFTER mount: the scan needs the module
  // styles attached to the document, which render time cannot guarantee.
  const [cssWarnings, setCssWarnings] = useState<CarouselDiagnosticWarning[]>(
    [],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCssWarnings(collectViewportCssWarnings());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const warnings = useMemo<CarouselDiagnosticWarning[]>(
    () => [
      ...collectPropWarnings(props),
      ...collectConstantWarnings(),
      ...collectViewportAxisWarnings(),
      ...collectSlideSourceMediaWarnings(slides),
      ...collectLayoutWarnings(layout),
      ...collectSlotWarnings(slots),
      ...collectStateWarnings(state),
      ...cssWarnings,
    ],
    [cssWarnings, layout, props, slides, slots, state],
  );

  useGroupedWarnings(warnings);

  return null;
});

export const Diagnostic: CarouselSlotComponent<typeof DiagnosticBase, "diagnostic"> =
  Object.assign(DiagnosticBase, { slot: "diagnostic" as const });

export default Diagnostic;
