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

// See docs/architecture/diagnostics.md
// Build-time constant, so every IS_DEV branch (and its collect* imports) drops
// from the production bundle.
const IS_DEV = import.meta.env.DEV;

/** One frozen empty result, shared by every gated-off collection. */
const EMPTY: CarouselDiagnosticWarning[] = [];

const BANNER =
  "[Carousel Diagnostic] enabled. Observe-mode only: diagnostics reports runtime misvalues but never repair or normalizes them.";

const DiagnosticBase = memo(function CarouselDiagnostic() {
  const { state, props, layout, slots } = useCarouselDiagnosticContext();
  const { slides } = useCarouselStable();

  useEffect(() => {
    if (!IS_DEV) return;
    console.info(BANNER);
  }, []);

  // Stylesheet audit runs AFTER mount (styles must be attached).
  const [cssWarnings, setCssWarnings] = useState<CarouselDiagnosticWarning[]>(
    [],
  );
  useEffect(() => {
    if (!IS_DEV) return;
    const frame = requestAnimationFrame(() => {
      setCssWarnings(collectViewportCssWarnings());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Each group is memoised on only what it depends on, and gated on IS_DEV so
  // no collection runs (or ships) in production.
  const constantWarnings = useMemo(
    () =>
      IS_DEV
        ? [...collectConstantWarnings(), ...collectViewportAxisWarnings()]
        : EMPTY,
    [],
  );
  const propWarnings = useMemo(
    () => (IS_DEV ? collectPropWarnings(props) : EMPTY),
    [props],
  );
  const dataWarnings = useMemo(
    () => (IS_DEV ? collectSlideSourceMediaWarnings(slides) : EMPTY),
    [slides],
  );
  const layoutWarnings = useMemo(
    () => (IS_DEV ? collectLayoutWarnings(layout) : EMPTY),
    [layout],
  );
  const slotWarnings = useMemo(
    () => (IS_DEV ? collectSlotWarnings(slots) : EMPTY),
    [slots],
  );
  const stateWarnings = useMemo(
    () => (IS_DEV ? collectStateWarnings(state) : EMPTY),
    [state],
  );

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

export const Diagnostic: CarouselSlotComponent<
  typeof DiagnosticBase,
  "diagnostic"
> = Object.assign(DiagnosticBase, { slot: "diagnostic" as const });

export default Diagnostic;
