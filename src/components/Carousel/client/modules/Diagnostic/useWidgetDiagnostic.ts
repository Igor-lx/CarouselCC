import { useMemo } from "react";

import { useCarouselStable } from "../../context";
import { collectWidgetWarnings, type WidgetDiagnosticInput } from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

// See docs/architecture/diagnostics.md
// Build-time constant so the branch (and its check imports) drops in production.
const IS_DEV = import.meta.env.DEV;

const EMPTY_WARNINGS: ReturnType<typeof collectWidgetWarnings> = [];

/** Widget diagnostic hook — runs only in dev with a Diagnostic slot attached. */
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
