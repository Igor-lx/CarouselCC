import { clampNumber, isFiniteNumber } from "../../../../shared";
import { PAGINATION_WIDGET_DEFAULTS, PAGINATION_WIDGET_LIMITS } from "./defaults";
import type {
  PaginationWidgetProps,
  PaginationWidgetSpatialConfig,
} from "./types";

const finiteOr = (value: number | undefined, fallback: number) =>
  isFiniteNumber(value) ? value : fallback;

const oddIntegerInRange = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  let v = clampNumber(Math.floor(finiteOr(value, fallback)), min, max);
  if (v % 2 === 0) v = v < max ? v + 1 : v - 1;
  return v;
};

const numberInRange = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const finite = finiteOr(value, fallback);
  const valueOrFallback = finite >= min ? finite : fallback;
  return clampNumber(valueOrFallback, min, max);
};

export const normalizeVisibleDots = (visibleDots: number | undefined) =>
  oddIntegerInRange(
    visibleDots,
    PAGINATION_WIDGET_DEFAULTS.visibleDots,
    PAGINATION_WIDGET_LIMITS.minVisibleDots,
    PAGINATION_WIDGET_LIMITS.maxVisibleDots,
  );

export const normalizeSpatial = ({
  size,
  gap,
  scaleFactor,
}: PaginationWidgetSpatialConfig): PaginationWidgetSpatialConfig => ({
  size: numberInRange(
    size,
    PAGINATION_WIDGET_DEFAULTS.dotSize,
    PAGINATION_WIDGET_LIMITS.minDotSize,
    PAGINATION_WIDGET_LIMITS.maxDotSize,
  ),
  gap: numberInRange(
    gap,
    PAGINATION_WIDGET_DEFAULTS.dotGap,
    PAGINATION_WIDGET_LIMITS.minDotGap,
    PAGINATION_WIDGET_LIMITS.maxDotGap,
  ),
  scaleFactor: numberInRange(
    scaleFactor,
    PAGINATION_WIDGET_DEFAULTS.scaleFactor,
    PAGINATION_WIDGET_LIMITS.minScaleFactor,
    PAGINATION_WIDGET_LIMITS.maxScaleFactor,
  ),
});

export const normalizePaginationWidgetConfig = ({
  visibleDots,
  dotSize,
  dotGap,
  scaleFactor,
}: Pick<
  PaginationWidgetProps,
  "visibleDots" | "dotSize" | "dotGap" | "scaleFactor"
>) => ({
  visibleDots: normalizeVisibleDots(visibleDots),
  spatial: normalizeSpatial({
    size: dotSize ?? PAGINATION_WIDGET_DEFAULTS.dotSize,
    gap: dotGap ?? PAGINATION_WIDGET_DEFAULTS.dotGap,
    scaleFactor: scaleFactor ?? PAGINATION_WIDGET_DEFAULTS.scaleFactor,
  }),
});
