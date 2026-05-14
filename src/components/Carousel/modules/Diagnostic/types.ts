/**
 * Severity of a diagnostic warning. Diagnostics observe runtime values and
 * report expected runtime behaviour. They do not repair values themselves.
 */
export type DiagnosticSeverity = "CRITICAL" | "LOGICAL";

/**
 * One observation from the diagnostic layer. `severity`, `layer`, and
 * `field` together identify the source; `actual`, `expected`, `consequence`
 * describe what is wrong and what will happen at runtime.
 *
 * Diagnostics is observe/report-only. Emitting a warning never changes the
 * runtime value the carousel uses; when runtime has an explicit
 * normalisation rule for an out-of-range value, `normalizedTo` reports the
 * value runtime substitutes in place of the raw input. The normalisation
 * itself lives in the consumer (e.g. `normalizeMotionProfileShares` inside
 * the motion layer) — Diagnostic merely surfaces the fact that it ran.
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
