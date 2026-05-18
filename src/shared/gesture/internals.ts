import type { ResolvedPointerSwipeConfig } from "./types";

const FRAME_BUDGET_MS = 1000 / 60;

/**
 * Lower bound for the `1 - resistance` denominator in the stiffness term.
 * Keeps `applyResistance` finite as `resistance` approaches 1.
 */
const MIN_RESISTANCE_DENOMINATOR = 0.001;

export const safeResistance = (value: number) => Math.max(0, Math.min(1, value));

export const applyResistance = (
  offset: number,
  resistance: number,
  curvature: number,
): number => {
  const sign = Math.sign(offset);
  const abs = Math.abs(offset);
  const safe = safeResistance(resistance);
  const stiffness =
    safe <= 0 ? 0 : safe / Math.max(1 - safe, MIN_RESISTANCE_DENOMINATOR);
  return sign * (abs / (1 + abs * Math.max(0, curvature) * stiffness));
};

export const clampMagnitude = (value: number, limit: number) =>
  Math.sign(value) * Math.min(Math.abs(value), limit);

export const calculateEma = (
  previous: number,
  instant: number,
  alpha: number,
) => previous * (1 - alpha) + instant * alpha;

export const frameAdjustedAlpha = (alpha: number, dt: number) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(1, dt / FRAME_BUDGET_MS);
  return 1 - Math.pow(1 - safe, frames);
};

export const decayedVelocity = (velocity: number, alpha: number, dt: number) => {
  const safe = Math.max(0, Math.min(1, alpha));
  const frames = Math.max(0, dt / FRAME_BUDGET_MS);
  const elapsedAlpha = 1 - Math.pow(1 - safe, frames);
  return calculateEma(velocity, 0, elapsedAlpha);
};

const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "a[href]",
  "summary",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[data-drag-ignore='true']",
].join(",");

export const getInteractiveTarget = (
  target: EventTarget | null,
  boundary: HTMLElement,
): Element | null => {
  if (!(target instanceof Element)) return null;
  const interactive = target.closest(INTERACTIVE_TARGET_SELECTOR);
  if (!interactive || !boundary.contains(interactive)) return null;
  return interactive;
};

interface ResolveDirectionInput {
  rawOffset: number;
  rawVelocity: number;
  width: number;
  config: ResolvedPointerSwipeConfig;
  canCommit: boolean;
}

export const resolveSwipeDirection = ({
  rawOffset,
  rawVelocity,
  width,
  config,
  canCommit,
}: ResolveDirectionInput) => {
  if (!canCommit) {
    return { direction: "none" as const, pointerReleaseVelocity: rawVelocity };
  }

  const flicked =
    Math.abs(rawVelocity) >= config.quickFlickVelocity &&
    Math.abs(rawOffset) >= config.quickFlickMinOffset;

  const distanceThreshold = Math.max(
    config.minSwipeDistance,
    Math.max(0, width) * config.swipeThresholdRatio,
  );
  const resistanceFactor = 1 - safeResistance(config.resistance);
  const adapted = Math.max(config.minSwipeDistance, distanceThreshold * resistanceFactor);

  if (flicked) {
    return {
      direction: rawOffset < 0 ? ("left" as const) : ("right" as const),
      pointerReleaseVelocity: rawVelocity,
    };
  }

  if (Math.abs(rawOffset) >= adapted) {
    return {
      direction: rawOffset < 0 ? ("left" as const) : ("right" as const),
      pointerReleaseVelocity: rawVelocity,
    };
  }

  return { direction: "none" as const, pointerReleaseVelocity: rawVelocity };
};
