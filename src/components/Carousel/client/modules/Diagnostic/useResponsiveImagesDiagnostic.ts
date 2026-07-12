import { useMemo } from "react";

import { useCarouselStable } from "../../context";
import {
  collectResponsiveImagesWarnings,
  type ResponsiveImagesDiagnosticInput,
} from "./checks";
import { useGroupedWarnings } from "./useGroupedWarnings";

const EMPTY_WARNINGS: ReturnType<typeof collectResponsiveImagesWarnings> = [];

/**
 * ResponsiveImages module diagnostic hook. Runs only when a Diagnostic slot
 * is attached — otherwise zero diagnostic overhead (same contract as
 * `useWidgetDiagnostic`).
 */
export function useResponsiveImagesDiagnostic(
  input: ResponsiveImagesDiagnosticInput,
): void {
  const { layout } = useCarouselStable();
  const isActive = layout.isDiagnosticActive;

  const warnings = useMemo(
    () => (isActive ? collectResponsiveImagesWarnings(input) : EMPTY_WARNINGS),
    [input.preloadPagesNr, isActive],
  );

  useGroupedWarnings(warnings);
}
