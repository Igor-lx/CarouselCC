import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type PointerSwipePhase = "idle" | "press" | "dragging" | "cooldown";

export type PointerSwipeDirection = "left" | "right" | "none";

export interface PointerSwipeConfig {
  /** Quiet period after a release before new gestures are accepted. */
  cooldownMs?: number;
  /** Minimum horizontal distance (px) to convert a press into a drag. */
  intentThreshold?: number;
  /** Progressive drag resistance in (0, 1): the UI offset lags the raw
   * finger travel more as the pull grows. Applied to the whole offset on
   * every sample — the engine has no notion of edges. `0` = 1:1 tracking. */
  resistance?: number;
  /** How quickly the resistance lag ramps up with distance. */
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
}

export interface PointerSwipeProps {
  /**
   * The gesture HOST element — required, no internal fallback. HARD CONTRACT:
   * this must be the very element the returned `listeners` (and `hostStyle`)
   * are applied to. The engine ties three things to it: native click/touchmove
   * suppression during a gesture, pointer-capture release, and the fallback
   * width measurement for the swipe-distance threshold (the primary width is
   * read from the event's `currentTarget` — the same element when the
   * contract holds).
   */
  hostRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  config?: PointerSwipeConfig;
  onPressStart?: () => void;
  onDragStart?: (payload: PointerSwipeMovePayload) => void;
  onDragMove?: (payload: PointerSwipeMovePayload) => void;
  onRelease?: (payload: PointerSwipeReleasePayload) => void;
}

export interface PointerSwipeResult {
  /** Pointer handlers to spread onto the host element. Empty when disabled. */
  listeners: PointerSwipeListeners;
  /**
   * Styles the engine requires on the host (`touch-action`, `user-select`,
   * overscroll containment). Handed out separately from `listeners` so the
   * consumer merges it with its own `style` consciously. Empty when disabled.
   */
  hostStyle: CSSProperties;
}
