import { EDGE_DOT_DRIFT_FACTOR } from "../defaults";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "../types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const writeDotProjection = (
  target: PaginationWidgetDotState,
  id: number,
  visualOffset: number,
  geometry: PaginationWidgetGeometry,
): PaginationWidgetDotState => {
  const distance = id - visualOffset;
  const { centerIndex, strip, scales, visibleCount, unit } = geometry;
  const slot = distance + centerIndex;

  let x: number;
  if (slot < 0) {
    x = strip[0]! - (1 - Math.exp(slot)) * (unit * EDGE_DOT_DRIFT_FACTOR);
  } else if (slot > visibleCount - 1) {
    x =
      strip[visibleCount - 1]! +
      (1 - Math.exp(-(slot - (visibleCount - 1)))) *
        (unit * EDGE_DOT_DRIFT_FACTOR);
  } else {
    const lower = Math.floor(slot);
    const upper = Math.ceil(slot);
    const t = slot - lower;
    const xL = strip[lower]!;
    const xU = strip[upper] ?? xL + unit;
    x = xL + (xU - xL) * t;
  }

  const floorSlot = Math.floor(slot);
  const ceilSlot = Math.ceil(slot);
  const t = slot - floorSlot;
  const scaleLower = scales[floorSlot] ?? 0;
  const scaleUpper = scales[ceilSlot] ?? 0;
  const scale = scaleLower + (scaleUpper - scaleLower) * t;

  const absDistance = Math.abs(distance);
  target.id = id;
  target.x = x;
  target.scale = scale;
  target.opacity =
    absDistance > centerIndex - 0.5
      ? Math.max(0, 1 - (absDistance - (centerIndex - 0.5)))
      : 1;
  target.activeStrength = clamp01(1 - absDistance);
  target.isActive = id === Math.round(visualOffset);

  return target;
};

export const projectDot = (
  id: number,
  visualOffset: number,
  geometry: PaginationWidgetGeometry,
): PaginationWidgetDotState =>
  writeDotProjection(
    {
      id,
      x: 0,
      scale: 0,
      opacity: 0,
      activeStrength: 0,
      isActive: false,
    },
    id,
    visualOffset,
    geometry,
  );
