import type {
  PaginationWidgetGeometry,
  PaginationWidgetSpatialConfig,
} from "../types";

const buildScales = (
  visibleCount: number,
  centerIndex: number,
  scaleFactor: number,
): number[] =>
  Array.from({ length: visibleCount }, (_, index) => {
    const distance = Math.abs(index - centerIndex);
    return distance > centerIndex + 0.5 ? 0 : Math.pow(scaleFactor, distance);
  });

const buildStrip = (
  scales: number[],
  spatial: PaginationWidgetSpatialConfig,
): number[] => {
  const count = scales.length;
  const center = Math.floor(count / 2);
  const strip = new Array<number>(count).fill(0);
  for (let i = center + 1; i < count; i += 1) {
    strip[i] =
      strip[i - 1]! + spatial.gap + (spatial.size * (scales[i - 1]! + scales[i]!)) / 2;
  }
  for (let i = center - 1; i >= 0; i -= 1) {
    strip[i] =
      strip[i + 1]! - spatial.gap - (spatial.size * (scales[i + 1]! + scales[i]!)) / 2;
  }
  return strip;
};

export const buildPaginationWidgetGeometry = (
  visibleDots: number,
  spatial: PaginationWidgetSpatialConfig,
): PaginationWidgetGeometry => {
  const visibleCount = visibleDots;
  const centerIndex = Math.floor(visibleCount / 2);
  const scales = buildScales(visibleCount, centerIndex, spatial.scaleFactor);
  return {
    visibleCount,
    centerIndex,
    scales,
    strip: buildStrip(scales, spatial),
    unit: spatial.size + spatial.gap,
  };
};

export const widgetProjectionSide = (visibleCount: number) =>
  Math.ceil(visibleCount / 2);

export const widgetProjectionSlotCount = (visibleCount: number) =>
  widgetProjectionSide(visibleCount) * 2 + 1;
