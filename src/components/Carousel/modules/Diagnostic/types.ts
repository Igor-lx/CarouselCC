export type DiagnosticSeverity = "CRITICAL" | "LOGICAL";

export interface CarouselDiagnosticWarning {
  severity: DiagnosticSeverity;
  layer: string;
  field: string;
  actual: unknown;
  normalizedTo?: unknown;
  expected: string;
  consequence: string;
}
