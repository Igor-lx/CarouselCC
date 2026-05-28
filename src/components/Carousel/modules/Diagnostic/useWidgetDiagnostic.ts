import { useMemo } from "react";

import { useCarouselModuleContext } from "../../context";
import { collectWidgetWarnings, type WidgetDiagnosticInput } from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

const EMPTY_WARNINGS: ReturnType<typeof collectWidgetWarnings> = [];

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
