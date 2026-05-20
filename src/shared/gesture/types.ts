import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type PointerSwipePhase = "idle" | "press" | "dragging" | "cooldown";

export type PointerSwipeDirection = "left" | "right" | "none";

export interface PointerSwipeConfig {
  /** Quiet period after a release before new gestures are accepted. */
  cooldownMs?: number;
  /** Minimum horizontal distance (px) to convert a press into a drag. */
  intentThreshold?: number;
  /** Edge-overpull resistance factor in (0, 1). */
  resistance?: number;
  /** How quickly resistance stiffens as overpull grows. */
  resistanceCurvature?: number;
  /** Velocity safety clamp (px / ms). */
  maxVelocity?: number;
  /** Velocity EMA smoothing weight in (0, 1]. */
  emaAlpha?: number;
  /** Minimum raw pointer velocity (px/ms) for a quick-flick. */
  quickFlickVelocity?: number;
  /** Minimum raw pointer offset (px) for a quick-flick. */
  quickFlickMinOffset?: number;
  /** Minimum distance (px) before a distance-based swipe registers. */
  minSwipeDistance?: number;
  /** Distance threshold expressed as fraction of viewport width. */
  swipeThresholdRatio?: number;
}

export type ResolvedPointerSwipeConfig = Required<PointerSwipeConfig>;

export interface PointerSwipeMovePayload {
  uiOffset: number;
}

export interface PointerSwipeReleasePayload extends PointerSwipeMovePayload {
  direction: PointerSwipeDirection;
  pointerReleaseVelocity: number;
  uiReleaseVelocity: number;
}

export interface PointerSwipeListeners {
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: (e: ReactPointerEvent) => void;
  onLostPointerCapture?: (e: ReactPointerEvent) => void;
  style?: CSSProperties;
}

export interface PointerSwipeProps {
  measureRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  config?: PointerSwipeConfig;
  onPressStart?: () => void;
  onDragStart?: (payload: PointerSwipeMovePayload) => void;
  onDragMove?: (payload: PointerSwipeMovePayload) => void;
  onRelease?: (payload: PointerSwipeReleasePayload) => void;
}

export interface PointerSwipeResult {
  listeners: PointerSwipeListeners;
}
