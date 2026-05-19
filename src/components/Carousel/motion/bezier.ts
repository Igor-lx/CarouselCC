import {
  AUTO_BEZIER,
  MOVE_BEZIER,
  SNAP_BACK_BEZIER,
} from "../config";
import { clamp } from "../domain";
import type { MotionPhase, MoveReason } from "../state";
import type { CubicBezier } from "./types";

const LINEAR: CubicBezier = { x1: 0, y1: 0, x2: 1, y2: 1 };
const BEZIER_REGEX =
  /cubic-bezier\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/i;

export const carouselEasingString = (
  motionPhase: MotionPhase,
  moveReason: MoveReason,
): string => {
  if (motionPhase === "step-snap") return SNAP_BACK_BEZIER;

  switch (moveReason) {
    case "autoplay":
      return AUTO_BEZIER;
    case "gesture":
    case "click":
    default:
      return MOVE_BEZIER;
  }
};

/**
 * Parse a `cubic-bezier(...)` or `linear` string into a control-point record.
 * No clamping, no fallback: the caller is responsible for syntactically valid
 * input. A non-matching string yields a record of NaNs and downstream motion
 * math will visibly fail — the diagnostic layer surfaces the same issue.
 */
const parseBezierString = (raw: string): CubicBezier => {
  if (raw.trim().toLowerCase() === "linear") return LINEAR;
  const match = BEZIER_REGEX.exec(raw);
  if (!match) {
    return { x1: Number.NaN, y1: Number.NaN, x2: Number.NaN, y2: Number.NaN };
  }
  return {
    x1: Number.parseFloat(match[1] ?? ""),
    y1: Number.parseFloat(match[2] ?? ""),
    x2: Number.parseFloat(match[3] ?? ""),
    y2: Number.parseFloat(match[4] ?? ""),
  };
};

const cache = new Map<string, CubicBezier>();

export const parseBezier = (raw: string): CubicBezier => {
  const cached = cache.get(raw);
  if (cached) return cached;
  const parsed = parseBezierString(raw);
  cache.set(raw, parsed);
  return parsed;
};

export const isParsedBezierValid = (bezier: CubicBezier) =>
  Number.isFinite(bezier.x1) &&
  Number.isFinite(bezier.y1) &&
  Number.isFinite(bezier.x2) &&
  Number.isFinite(bezier.y2);

const bezierValue = (t: number, p1: number, p2: number) => {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * p1 +
    3 * inverse * t * t * p2 +
    t * t * t
  );
};

const bezierDerivative = (t: number, p1: number, p2: number) => {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * p1 +
    6 * inverse * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  );
};

const solveT = (bezier: CubicBezier, progress: number) => {
  const target = clamp(progress, 0, 1);
  let t = target;

  for (let i = 0; i < 5; i += 1) {
    const x = bezierValue(t, bezier.x1, bezier.x2);
    const derivative = bezierDerivative(t, bezier.x1, bezier.x2);
    if (Math.abs(x - target) < 1e-6 || Math.abs(derivative) < 1e-6) break;
    t = clamp(t - (x - target) / derivative, 0, 1);
  }

  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 8; i += 1) {
    const x = bezierValue(t, bezier.x1, bezier.x2);
    if (Math.abs(x - target) < 1e-6) break;
    if (x < target) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }

  return t;
};

export interface BezierSample {
  progress: number;
  slope: number;
}

export const sampleBezier = (bezier: CubicBezier, progress: number): BezierSample => {
  const t = solveT(bezier, progress);
  const eased = clamp(bezierValue(t, bezier.y1, bezier.y2), 0, 1);
  const dx = bezierDerivative(t, bezier.x1, bezier.x2);
  const dy = bezierDerivative(t, bezier.y1, bezier.y2);
  const slope = Math.abs(dx) > 1e-6 ? dy / dx : 0;

  return {
    progress: eased,
    slope,
  };
};
