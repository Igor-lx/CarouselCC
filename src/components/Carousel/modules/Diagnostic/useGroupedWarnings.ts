import { useEffect, useRef } from "react";
import { formatWarning, warningSignature } from "./formatter";
import type { CarouselDiagnosticWarning } from "./types";

/**
 * Emit a batch of diagnostic warnings to `console.warn`, deduped by signature
 * so React Strict Mode double-invocations and stable inputs do not produce
 * warning spam. DEV-only: production builds are silent.
 */
export function useGroupedWarnings(warnings: CarouselDiagnosticWarning[]): void {
  const lastSignatureRef = useRef("");

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    if (warnings.length === 0) {
      lastSignatureRef.current = "";
      return;
    }

    const signature = warnings.map(warningSignature).join("\n");
    if (signature === lastSignatureRef.current) return;

    lastSignatureRef.current = signature;
    warnings.forEach((warning) => {
      console.warn(formatWarning(warning));
    });
  }, [warnings]);
}
