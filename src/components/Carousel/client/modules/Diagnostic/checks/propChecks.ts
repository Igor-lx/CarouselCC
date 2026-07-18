import {
  isNonNegativeFinite,
  isPositiveFinite,
  isPositiveInteger,
} from "../../../../../../shared";
import type { CarouselDiagnosticContextValue } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

const LAYER = "Props";

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

  out.push(...collectEnvironmentWarnings(props.userEnvironment));

  return out;
};

const ENVIRONMENT_LAYER = "Environment";

/** Read one field of the untyped `userEnvironment` prop. */
const readEnvironmentField = (environment: unknown, field: string): unknown =>
  typeof environment === "object" && environment !== null
    ? (environment as Record<string, unknown>)[field]
    : undefined;

const ENVIRONMENT_FIELDS: ReadonlyArray<{ field: string; consequence: string }> = [
  {
    field: "reducedMotion",
    consequence:
      "Transitions will not respect the user's prefers-reduced-motion setting (accessibility regression)",
  },
  {
    field: "touch",
    consequence:
      "Gesture eligibility and touch-only control visibility fall back to desktop behaviour",
  },
  {
    field: "dataSaver",
    consequence:
      "Speculative image warm-up is not skipped for users who opted into reduced data usage",
  },
];

/**
 * The carousel does not detect the environment itself — the host must inject
 * it via the `userEnvironment` prop (see `useUserEnvironment` in `shared`).
 * A missing object, or a missing field, is reported here rather than silently
 * defaulted, so the wiring gap is visible.
 */
const collectEnvironmentWarnings = (
  environment: unknown,
): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  for (const { field, consequence } of ENVIRONMENT_FIELDS) {
    const value = readEnvironmentField(environment, field);
    if (typeof value === "boolean") continue;
    out.push({
      severity: "LOGICAL",
      layer: ENVIRONMENT_LAYER,
      field: `userEnvironment.${field}`,
      actual: value,
      expected:
        "Expected a boolean — wire shared/useUserEnvironment in the host and pass its result as the userEnvironment prop",
      consequence: `${consequence}; the carousel treats the missing signal as false`,
    });
  }

  return out;
};
