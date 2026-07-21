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

  // Split by what each group actually depends on. The carousel state changes
  // on every dispatch — twice per ride, in the frames where the animation
  // starts and settles — and the constant/axis audits do not depend on it at
  // all: recomputing ~60 numeric rules and a `matchMedia` call per canonical
  // condition there was pure work in the worst possible frame.
  const constantWarnings = useMemo(
    () => [...collectConstantWarnings(), ...collectViewportAxisWarnings()],
    [],
  );
  const propWarnings = useMemo(() => collectPropWarnings(props), [props]);
  const dataWarnings = useMemo(
    () => collectSlideSourceMediaWarnings(slides),
    [slides],
  );
  const layoutWarnings = useMemo(() => collectLayoutWarnings(layout), [layout]);
  const slotWarnings = useMemo(() => collectSlotWarnings(slots), [slots]);
  const stateWarnings = useMemo(() => collectStateWarnings(state), [state]);

  const warnings = useMemo<CarouselDiagnosticWarning[]>(
    () => [
      ...propWarnings,
      ...constantWarnings,
      ...dataWarnings,
      ...layoutWarnings,
      ...slotWarnings,
      ...stateWarnings,
      ...cssWarnings,
    ],
    [
      constantWarnings,
      cssWarnings,
      dataWarnings,
      layoutWarnings,
      propWarnings,
      slotWarnings,
      stateWarnings,
    ],
  );

  useGroupedWarnings(warnings);

  return null;
});

export const Diagnostic: CarouselSlotComponent<typeof DiagnosticBase, "diagnostic"> =
  Object.assign(DiagnosticBase, { slot: "diagnostic" as const });

export default Diagnostic;
