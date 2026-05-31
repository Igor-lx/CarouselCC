import { useMemo } from "react";

import { useCarouselModuleContext } from "../../context";
import { collectWidgetWarnings, type WidgetDiagnosticInput } from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

const EMPTY_WARNINGS: ReturnType<typeof collectWidgetWarnings> = [];

/**
 * Pagination widget diagnostic hook. Runs the widget checks only when a
 * Diagnostic slot is attached to the carousel — otherwise diagnostics are
 * fully skipped and the widget runs with zero diagnostic overhead.
 */
export function useWidgetDiagnostic(input: WidgetDiagnosticInput): void {
  const { layout } = useCarouselModuleContext();
  const isActive = layout.isDiagnosticActive;

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
