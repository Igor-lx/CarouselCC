import type { DevNoticeEntry } from "../../../../shared";
import {
  coerceClampedNumber,
  coerceFiniteNumber,
  coerceNonNegativeNumber,
  coercePositiveNumber,
} from "../../../../shared";
import {
  buildRawCarouselConfig,
  CAROUSEL_DEFAULTS,
  type CarouselDiagnosticResolver,
  type CarouselRuntimeConfig,
  type RawConfigInput,
} from "../../config";

const VISIBLE_SLIDES_LIMITS = { min: 1, max: 20 } as const;

const noticeForBounded = (
  field: string,
  provided: unknown,
  normalized: number,
  reason: string,
  unit?: string,
): DevNoticeEntry | null => {
  if (typeof provided === "undefined") return null;
  if (provided === normalized) return null;
  return { field, provided, normalized, reason, unit };
};

const normalizeVisibleSlidesCount = (raw: unknown): { value: number; notice: DevNoticeEntry | null } => {
  if (typeof raw === "undefined") {
    return { value: CAROUSEL_DEFAULTS.visibleSlidesNr, notice: null };
  }
  const clamped = coerceClampedNumber(
    raw,
    CAROUSEL_DEFAULTS.visibleSlidesNr,
    VISIBLE_SLIDES_LIMITS.min,
    VISIBLE_SLIDES_LIMITS.max,
  );
  const integer = Math.floor(clamped);
  return {
    value: integer,
    notice: noticeForBounded(
      "visibleSlidesNr",
      raw,
      integer,
      `must be an integer in [${VISIBLE_SLIDES_LIMITS.min}, ${VISIBLE_SLIDES_LIMITS.max}]`,
    ),
  };
};

const normalizeDuration = (
  field: string,
  raw: unknown,
  fallback: number,
): { value: number; notice: DevNoticeEntry | null } => {
  if (typeof raw === "undefined") return { value: fallback, notice: null };
  const value = coercePositiveNumber(raw, fallback);
  return {
    value,
    notice: noticeForBounded(field, raw, value, "must be a positive finite number", "ms"),
  };
};

const normalizeInterval = (
  raw: unknown,
  fallback: number,
): { value: number; notice: DevNoticeEntry | null } => {
  if (typeof raw === "undefined") return { value: fallback, notice: null };
  const value = coerceNonNegativeNumber(raw, fallback);
  return {
    value,
    notice: noticeForBounded("intervalAutoplay", raw, value, "must be a non-negative finite number", "ms"),
  };
};

const normalizeErrorAltPlaceholder = (
  raw: unknown,
  fallback: string,
): { value: string; notice: DevNoticeEntry | null } => {
  if (typeof raw === "undefined") return { value: fallback, notice: null };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return { value: trimmed, notice: null };
    return {
      value: fallback,
      notice: {
        field: "errAltPlaceholder",
        provided: raw,
        normalized: fallback,
        reason: "must be a non-empty string",
      },
    };
  }
  return {
    value: fallback,
    notice: {
      field: "errAltPlaceholder",
      provided: raw,
      normalized: fallback,
      reason: "must be a string",
    },
  };
};

export const resolveCarouselDiagnostic: CarouselDiagnosticResolver = (
  input: RawConfigInput,
) => {
  const base = buildRawCarouselConfig({});
  const notices: DevNoticeEntry[] = [];

  const visibleSlides = normalizeVisibleSlidesCount(input.visibleSlidesNr);
  if (visibleSlides.notice) notices.push(visibleSlides.notice);

  const autoplayDuration = normalizeDuration(
    "durationAutoplay",
    input.durationAutoplay,
    base.autoplayDuration,
  );
  if (autoplayDuration.notice) notices.push(autoplayDuration.notice);

  const stepDuration = normalizeDuration(
    "durationStep",
    input.durationStep,
    base.stepDuration,
  );
  if (stepDuration.notice) notices.push(stepDuration.notice);

  const jumpDuration = normalizeDuration(
    "durationJump",
    input.durationJump,
    base.jumpDuration,
  );
  if (jumpDuration.notice) notices.push(jumpDuration.notice);

  const autoplayInterval = normalizeInterval(
    input.intervalAutoplay,
    base.autoplayInterval,
  );
  if (autoplayInterval.notice) notices.push(autoplayInterval.notice);

  const errAltPlaceholder = normalizeErrorAltPlaceholder(
    input.errAltPlaceholder,
    base.errorAltPlaceholder,
  );
  if (errAltPlaceholder.notice) notices.push(errAltPlaceholder.notice);

  const config: CarouselRuntimeConfig = {
    ...base,
    visibleSlidesCount: visibleSlides.value,
    autoplayDuration: autoplayDuration.value,
    stepDuration: stepDuration.value,
    jumpDuration: jumpDuration.value,
    autoplayInterval: autoplayInterval.value,
    errorAltPlaceholder: errAltPlaceholder.value,
  };

  // Touch is unknown at resolve time — left to useCarouselConfig to pick
  // the touch destination position from the same record.
  return { config, notices };
};

export { coerceFiniteNumber };
