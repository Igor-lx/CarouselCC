import { EDGE_DOT_DRIFT_FACTOR, EDGE_DOT_RESTING_OPACITY } from "../defaults";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "../types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The opacity FIELD: a dot's opacity by its absolute distance from the live
 * offset. Three zones —
 *   1 (plateau)                        d ≤ c − 0.5
 *   1 → resting over [c − 0.5, c]      the approach to the edge slot
 *   resting → 0 over [c, c + 1]        the handover fade — one FULL step
 * where c is the centre index and "resting" is EDGE_DOT_RESTING_OPACITY.
 *
 * The outer zone used to span half a step ([c − 0.5, c + 0.5]), which
 * SERIALIZED every edge handover: the leaving dot (d: c → c+1) hit zero at
 * half-way, and only then did the arriving dot (d: c+1 → c) leave zero —
 * measured mid-step as both edges invisible for a dozen frames. Spanning
 * exactly one step makes the two fades mirror images by construction:
 *   dotOpacityAt(c + f) + dotOpacityAt(c + 1 − f) === resting, f ∈ [0, 1]
 * — one dies precisely as fast as the other is born, on any tuning. The
 * inner zones are unchanged, so every resting look and every interior
 * transition is pixel-identical to before.
 */
export const dotOpacityAt = (absDistance: number, centerIndex: number): number => {
  const plateauEnd = centerIndex - 0.5;
  if (absDistance <= plateauEnd) return 1;
  if (absDistance <= centerIndex) {
    const t = (absDistance - plateauEnd) / 0.5;
    return 1 - (1 - EDGE_DOT_RESTING_OPACITY) * t;
  }
  return Math.max(0, EDGE_DOT_RESTING_OPACITY * (1 - (absDistance - centerIndex)));
};

/**
 * Write the projection state for one dot directly into `target`. Reusing
 * the target object avoids per-frame allocations for the motion-bound write
 * path.
 */
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
  target.opacity = dotOpacityAt(absDistance, centerIndex);
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
