import { isFiniteNumber } from "../../../../../shared";
import type { CarouselDiagnosticContextValue } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "Props";

const isPositiveInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0 && Number.isInteger(value);

const isPositiveFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isNonNegativeFinite = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Audit the public props the user passed in. Each check fires only when the
 * prop was *explicitly* provided (an `undefined` prop is the public-default
 * contract and is not an error).
 */
export const collectPropWarnings = (
  props: CarouselDiagnosticContextValue["props"],
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (typeof props.visibleSlidesNr !== "undefined" && !isPositiveInteger(props.visibleSlidesNr)) {
    out.push({
      severity: "CRITICAL",
      layer: LAYER,
      field: "visibleSlidesNr",
      actual: props.visibleSlidesNr,
      expected: "Expected a positive integer (e.g. 1, 2, 3, ...)",
      consequence:
        "Page math, slot measurement and the visible band rely on this count and may yield NaN or impossible geometry",
    });
  }

  const durationFields: Array<{
    key: keyof typeof props;
    name: string;
  }> = [
    { key: "durationAutoplay", name: "durationAutoplay" },
    { key: "durationStep", name: "durationStep" },
    { key: "durationJump", name: "durationJump" },
  ];

  for (const { key, name } of durationFields) {
    const value = props[key];
    if (typeof value === "undefined") continue;
    if (!isPositiveFinite(value)) {
      out.push({
        severity: "CRITICAL",
        layer: LAYER,
        field: name,
        actual: value,
        expected: "Expected a positive finite number of milliseconds",
        consequence:
          "Motion-runner duration math will produce NaN or zero-length segments and the carousel will jump or freeze",
      });
    }
  }

  if (
    typeof props.intervalAutoplay !== "undefined" &&
    !isNonNegativeFinite(props.intervalAutoplay)
  ) {
    out.push({
      severity: "CRITICAL",
      layer: LAYER,
      field: "intervalAutoplay",
      actual: props.intervalAutoplay,
      expected: "Expected a non-negative finite number of milliseconds",
      consequence:
        "setTimeout receives an invalid delay and autoplay may misfire or stop scheduling",
    });
  }

  if (
    typeof props.errAltPlaceholder !== "undefined" &&
    !isNonEmptyString(props.errAltPlaceholder)
  ) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "errAltPlaceholder",
      actual: props.errAltPlaceholder,
      expected: "Expected a non-empty string",
      consequence:
        "Slides whose image fails to load will render an empty alt fallback and become invisible",
    });
  }

  if (
    isPositiveFinite(props.durationJump) &&
    isPositiveFinite(props.durationStep) &&
    props.durationJump > props.durationStep
  ) {
    out.push({
      severity: "LOGICAL",
      layer: LAYER,
      field: "durationJump",
      actual: props.durationJump,
      expected: `Expected durationJump <= durationStep (${props.durationStep} ms)`,
      consequence:
        "A jump animation slower than a single step inverts the visual contract and feels wrong",
    });
  }

  return out;
};
