// See docs/architecture/diagnostics.md — observe/report only, never repairs.
export type DiagnosticSeverity = "CRITICAL" | "LOGICAL";

/** One observation: `layer`+`field` identify the source; the rest describe it. */
export interface CarouselDiagnosticWarning {
  severity: DiagnosticSeverity;
  layer: string;
  field: string;
  actual: unknown;
  expected: string;
  consequence: string;
}
