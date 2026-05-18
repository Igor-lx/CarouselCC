/**
 * Severity of a diagnostic warning. Diagnostics observe runtime values and
 * report expected runtime behaviour. They do not repair values themselves.
 */
export type DiagnosticSeverity = "CRITICAL" | "LOGICAL";

/**
 * One observation from the diagnostic layer. `layer` and `field` together
 * identify the source; `actual`, `expected`, `consequence` describe what is
 * wrong and what will happen at runtime.
 *
 * Diagnostics is observe/report only. Emitting a warning never changes the
 * runtime value the carousel uses; when runtime has an explicit normalization
 * rule, `normalizedTo` reports the value runtime will use.
 */
export interface CarouselDiagnosticWarning {
  severity: DiagnosticSeverity;
  layer: string;
  field: string;
  actual: unknown;
  normalizedTo?: unknown;
  expected: string;
  consequence: string;
}
