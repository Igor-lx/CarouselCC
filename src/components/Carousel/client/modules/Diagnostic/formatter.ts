// See docs/architecture/diagnostics.md
import type { CarouselDiagnosticWarning } from "./types";

const BANNER = "Carousel Diagnostic";
const TRAILER =
  "Diagnostics is observe-only and does not apply runtime changes.";

// Reached only for what `formatActual` has not already named: objects,
// functions, symbols, bigints. `String()` on an object yields "[object Object]"
// and hides what it was, so objects get their built-in tag instead.
const describeOpaque = (value: unknown): string => {
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return `${value}n`;
  return Object.prototype.toString.call(value);
};

const formatActual = (value: unknown): string => {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Number.POSITIVE_INFINITY) return "Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
    return String(value);
  }
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? describeOpaque(value);
  } catch {
    return describeOpaque(value);
  }
};

const finishSentence = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** The canonical warning line: `[Carousel Diagnostic][SEVERITY] Layer -> field ...`. */
export const formatWarning = (warning: CarouselDiagnosticWarning): string =>
  [
    `[${BANNER}][${warning.severity}] ${warning.layer} -> ${warning.field}`,
    `has value ${formatActual(warning.actual)}.`,
    finishSentence(warning.expected),
    finishSentence(warning.consequence),
    TRAILER,
  ]
    .filter(Boolean)
    .join(" ");

/** Deterministic signature for dedupe / cache. */
export const warningSignature = (warning: CarouselDiagnosticWarning): string =>
  [
    warning.severity,
    warning.layer,
    warning.field,
    formatActual(warning.actual),
    warning.expected,
    warning.consequence,
  ].join("|");
