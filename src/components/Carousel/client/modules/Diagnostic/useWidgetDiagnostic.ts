import { useMemo } from "react";

import { useCarouselStable } from "../../context";
import { collectWidgetWarnings, type WidgetDiagnosticInput } from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

/** Build-time constant: the whole diagnostic layer is a development tool.
 * Substituted by the bundler, so the branch guarded by it — and with it the
 * `collectWidgetWarnings` import and every check string it carries — leaves the
 * production bundle entirely. Without this the slot-attachment flag alone
 * decided, so a PRODUCTION build with `<Diagnostic />` mounted still ran the
 * whole widget audit on every geometry change and discarded the result. */
const IS_DEV = import.meta.env.DEV;

const EMPTY_WARNINGS: ReturnType<typeof collectWidgetWarnings> = [];

/**
 * Pagination widget diagnostic hook. Runs the widget checks only in
 * development, and only when a Diagnostic slot is attached — otherwise
 * diagnostics are fully skipped and the widget runs with zero overhead.
 */
export function useWidgetDiagnostic(input: WidgetDiagnosticInput): void {
  const { layout } = useCarouselStable();
  const isActive = IS_DEV && layout.isDiagnosticActive;

  const warnings = useMemo(
    () => (isActive ? collectWidgetWarnings(input) : EMPTY_WARNINGS),
    [
      input.dotGap,
      input.dotSize,
      input.scaleFactor,
      input.visibleDots,
      isActive,
    ],
  );

  useGroupedWarnings(warnings);
}
