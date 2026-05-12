/**
 * Severity of a diagnostic warning. Diagnostics never repair runtime values;
 * the severity describes *how badly* the runtime is expected to misbehave
 * when the developer ships the offending input.
 */
export type DiagnosticSeverity = "CRITICAL" | "LOGICAL";

/**
 * One observation from the diagnostic layer. `layer` and `field` together
 * identify the source; `actual`, `expected`, `consequence` describe what is
 * wrong and what will happen at runtime.
 *
 * Diagnostics is observe/report only — emitting a warning never changes the
 * runtime value the carousel uses.
 */
export interface CarouselDiagnosticWarning {
  severity: DiagnosticSeverity;
  layer: string;
  field: string;
  actual: unknown;
  expected: string;
  consequence: string;
}
