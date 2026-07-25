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

/** Build-time constant: the whole diagnostic layer is a development tool.
 * Substituted by the bundler, so every branch guarded by it — and every
 * `collect*` import behind that branch — leaves the production bundle. */
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

  // Stylesheet-dependent audit runs AFTER mount: the scan needs the module
  // styles attached to the document, which render time cannot guarantee.
  const [cssWarnings, setCssWarnings] = useState<CarouselDiagnosticWarning[]>(
    []
  );
  useEffect(() => {
    if (!IS_DEV) return;
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
  //
  // Every collection is additionally gated on IS_DEV. Reporting was already
  // dev-only (`useGroupedWarnings`), but the collecting was not: a production
  // build still re-validated the whole state on every dispatch and threw the
  // result away. Measured on the two frames that matter — the click frame and
  // the settle window are the ONLY frames the carousel spends main-thread time
  // in, so anything discarded there is the cheapest possible win. `IS_DEV` is
  // substituted at build time, so the branches (and with them every `collect*`
  // import) drop out of the production bundle entirely.
  const constantWarnings = useMemo(
    () =>
      IS_DEV
        ? [...collectConstantWarnings(), ...collectViewportAxisWarnings()]
        : EMPTY,
    []
  );
  const propWarnings = useMemo(
    () => (IS_DEV ? collectPropWarnings(props) : EMPTY),
    [props]
  );
  const dataWarnings = useMemo(
    () => (IS_DEV ? collectSlideSourceMediaWarnings(slides) : EMPTY),
    [slides]
  );
  const layoutWarnings = useMemo(
    () => (IS_DEV ? collectLayoutWarnings(layout) : EMPTY),
    [layout]
  );
  const slotWarnings = useMemo(
    () => (IS_DEV ? collectSlotWarnings(slots) : EMPTY),
    [slots]
  );
  const stateWarnings = useMemo(
    () => (IS_DEV ? collectStateWarnings(state) : EMPTY),
    [state]
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
    ]
  );

  useGroupedWarnings(warnings);

  return null;
});

export const Diagnostic: CarouselSlotComponent<
  typeof DiagnosticBase,
  "diagnostic"
> = Object.assign(DiagnosticBase, { slot: "diagnostic" as const });

export default Diagnostic;
