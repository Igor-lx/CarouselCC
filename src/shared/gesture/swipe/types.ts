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
  /**
   * Per-frame EMA weight of the FLICK-VELOCITY MEMORY — the weighted-average
   * gesture speed the flick decision and the release speed are based on, so
   * a fast gesture is not judged by its last (often decelerating) segment.
   */
  flickVelocityAlpha?: number;
  /** Hold before lift-off that costs the flick memory nothing (ms). */
  flickPauseGraceMs?: number;
  /** Beyond the grace, the flick memory halves every this many ms. */
  flickVelocityHalfLifeMs?: number;
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

export interface PointerSwipePressPayload {
  /**
   * Viewport-domain X where the finger LANDED. A consumer that freezes its
   * motion under a press (non-interactive surfaces take ownership on the
   * press itself) uses it to settle a motionless release back onto the
   * element that was actually pressed.
   */
  pressClientX: number;
}

export interface PointerSwipeMovePayload {
  uiOffset: number;
}

export interface PointerSwipeReleasePayload extends PointerSwipeMovePayload {
  direction: PointerSwipeDirection;
  pointerReleaseVelocity: number;
  uiReleaseVelocity: number;
  /**
   * The UI-domain speed a continuity launch should start the ride at: what the
   * strip was visibly carrying, judged over the gesture rather than over its
   * last two frames. `uiReleaseVelocity` is the raw instantaneous reading and a
   * momentary hold before lift-off zeroes it — which is how a deliberate slow
   * swipe ends, so the ride would launch from a standstill and crawl.
   */
  launchVelocity: number;
}

export interface PointerSwipeListeners {
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: (e: ReactPointerEvent) => void;
  onLostPointerCapture?: (e: ReactPointerEvent) => void;
}

/**
 * Everything the host element needs, as ONE spreadable bundle:
 * `<div {...hostProps}>`. The `ref` inside is what makes an element the
 * host, so the listeners, the required styles and the engine's native
 * suppressors land on the same element by construction. `ref` is always
 * present; listeners and `style` only while enabled.
 */
export interface PointerSwipeHostProps extends PointerSwipeListeners {
  ref: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}

/** A consumer-side ref the engine forwards the host element into. */
export type PointerSwipeHostRef =
  | ((node: HTMLElement | null) => void)
  | { current: HTMLElement | null };

export interface PointerSwipeProps {
  /**
   * OPTIONAL consumer ref: the engine owns the host element itself through
   * `hostProps.ref` and forwards the node here, so a consumer that also
   * needs the element (visibility, focus, measurement) does not wire a
   * second ref onto the DOM node.
   */
  hostRef?: PointerSwipeHostRef;
  enabled?: boolean;
  config?: PointerSwipeConfig;
  onPressStart?: (payload: PointerSwipePressPayload) => void;
  onDragStart?: (payload: PointerSwipeMovePayload) => void;
  onDragMove?: (payload: PointerSwipeMovePayload) => void;
  onRelease?: (payload: PointerSwipeReleasePayload) => void;
}

export interface PointerSwipeResult {
  /** Spread onto the host element: `<div {...hostProps}>` — ref, listeners
   * and required styles in one inseparable bundle. */
  hostProps: PointerSwipeHostProps;
}
