import { useMemo } from "react";

import { useCarouselStable } from "../../context";
import { collectWidgetWarnings, type WidgetDiagnosticInput } from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

// See docs/architecture/diagnostics.md
// Build-time constant so the branch (and its check imports) drops in production.
const IS_DEV = import.meta.env.DEV;

const EMPTY_WARNINGS: Readonly<ReturnType<typeof collectWidgetWarnings>> =
  Object.freeze([]);

/** Widget diagnostic hook — runs only in dev with a Diagnostic slot attached. */
export function useWidgetDiagnostic(input: WidgetDiagnosticInput): void {
  const { layout } = useCarouselStable();
  const isActive = IS_DEV && layout.isDiagnosticActive;

  // Keyed on the values, never on the input object: the caller rebuilds it on
  // every render, and these four fields are the whole of the input type.
  const { dotGap, dotSize, scaleFactor, visibleDots } = input;

  const warnings = useMemo(
    () =>
      isActive
        ? collectWidgetWarnings({ dotGap, dotSize, scaleFactor, visibleDots })
        : EMPTY_WARNINGS,
    [dotGap, dotSize, scaleFactor, visibleDots, isActive],
  );

  useGroupedWarnings(warnings);
}
