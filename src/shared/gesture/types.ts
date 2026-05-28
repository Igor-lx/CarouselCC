import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type PointerSwipePhase = "idle" | "press" | "dragging" | "cooldown";

export type PointerSwipeDirection = "left" | "right" | "none";

export interface PointerSwipeConfig {
  cooldownMs?: number;
  intentThreshold?: number;
  resistance?: number;
  resistanceCurvature?: number;
  maxVelocity?: number;
  emaAlpha?: number;
  quickFlickVelocity?: number;
  quickFlickMinOffset?: number;
  minSwipeDistance?: number;
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
