import type { CarouselDiagnosticWarning } from "./types";

const BANNER = "Carousel Diagnostic";
const TRAILER =
  "Diagnostics is observe-only and does not apply runtime changes.";

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
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const finishSentence = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/**
 * Build the canonical warning line shared by every diagnostic check.
 *
 *   [Carousel Diagnostic][SEVERITY] <Layer> -> <field> has value <actual>.
 *   [Runtime normalizes it to <normalizedTo>.] <expected>. <consequence>.
 *   Diagnostics is observe-only and does not apply runtime changes.
 *
 * The "normalizes it to" clause only appears when the warning carries a
 * `normalizedTo` value — i.e. when runtime has an explicit substitution rule
 * for the bad input (e.g. accel + decel shares overallocated → 0.5 / 0.5).
 */
export const formatWarning = (warning: CarouselDiagnosticWarning): string =>
  [
    `[${BANNER}][${warning.severity}] ${warning.layer} -> ${warning.field}`,
    `has value ${formatActual(warning.actual)}.`,
    typeof warning.normalizedTo === "undefined"
      ? ""
      : `Runtime normalizes it to ${formatActual(warning.normalizedTo)}.`,
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
    formatActual(warning.normalizedTo),
    warning.expected,
    warning.consequence,
  ].join("|");
