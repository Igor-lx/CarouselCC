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
 * runtime value the carousel uses: the carousel trusts its inputs and the
 * engines trust theirs, so there is no runtime normalization to mirror — a
 * warning describes what the value is and what it will cause, nothing more.
 */
export interface CarouselDiagnosticWarning {
  severity: DiagnosticSeverity;
  layer: string;
  field: string;
  actual: unknown;
  expected: string;
  consequence: string;
}
