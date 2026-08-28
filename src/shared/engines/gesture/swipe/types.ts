import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type PointerSwipePhase = "idle" | "press" | "dragging" | "cooldown";

export type PointerSwipeDirection = "left" | "right" | "none";

/** How an owned gesture ended — carries meaning for catch-and-hold consumers.
 * See ../README.md § End reasons (Android long-press → `external-cancel`). */
export type PointerSwipeEndReason =
  "release" | "vertical-scroll" | "external-cancel";

export interface PointerSwipeConfig {
  /** Quiet period after a release before new gestures are accepted. */
  cooldownMs?: number;
  /** Minimum horizontal distance (px) to convert a press into a drag. */
  intentThreshold?: number;
  /** Progressive drag resistance in (0, 1): the UI offset lags the raw
   * finger travel more as the pull grows. Applied to the whole offset on
   * every sample — the engine has no notion of edges. `0` = 1:1 tracking. */
  resistance?: number;
  /** How quickly the resistance lag ramps up with distance.*/
  resistanceCurvature?: number;
  /** Velocity safety clamp (px / ms). */
  maxVelocity?: number;
  /** Velocity EMA smoothing weight in (0, 1]. */
  emaAlpha?: number;
  /** Per-frame EMA weight of the flick-velocity memory (judges the whole
   * gesture, not its last, often decelerating, segment). */
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
  /** How long a press must rest before the engine takes ownership / brakes
   * (ms). `0` re-introduces the scroll hitch; keep it well below the OS
   * long-press or the context menu opens before the catch. */
  catchDelayMs?: number;
}

export type ResolvedPointerSwipeConfig = Required<PointerSwipeConfig>;

export interface PointerSwipePressPayload {
  /** Viewport-domain X where the finger landed — for settling a motionless
   * release back onto the element that was actually pressed. */
  pressClientX: number;
}

export interface PointerSwipeMovePayload {
  uiOffset: number;
}

export interface PointerSwipeReleasePayload extends PointerSwipeMovePayload {
  /** How the gesture ended (see PointerSwipeEndReason). */
  endReason: PointerSwipeEndReason;
  direction: PointerSwipeDirection;
  pointerReleaseVelocity: number;
  uiReleaseVelocity: number;
  /** UI-domain continuity-launch speed, judged over the whole gesture (not the
   * last frames). See ../README.md § End reasons. */
  launchVelocity: number;
}

export interface PointerSwipeListeners {
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: (e: ReactPointerEvent) => void;
  onLostPointerCapture?: (e: ReactPointerEvent) => void;
}

/** Everything the host needs as one spreadable bundle (`<div {...hostProps}>`);
 * the `ref` is what makes an element the host. See ../README.md § Principle. */
export interface PointerSwipeHostProps extends PointerSwipeListeners {
  ref: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}

/** A consumer-side ref the engine forwards the host element into. */
export type PointerSwipeHostRef =
  ((node: HTMLElement | null) => void) | { current: HTMLElement | null };

/** Turnkey "the finger drags your value". See ../README.md § Turnkey drag→value
 * (anchors at activation; 1:1 px↔unit; `read` catches a flying value). */
export interface PointerSwipeValueBinding {
  /** The value's live position at drag activation — the drag's anchor. */
  read: () => number;
  /** Receives `anchor + uiOffset` on activation and on every move. */
  write: (value: number) => void;
}

// Optionals read `?: T | undefined` on purpose: a consumer forwarding its own
// optional straight through (`surfaceRef: props.surfaceRef`) is the normal
// shape, and a bare `?:` rejects it under `exactOptionalPropertyTypes`.
export interface PointerSwipeProps {
  /** Optional consumer ref the engine forwards the owned host node into (no
   * second ref on the DOM). */
  hostRef?: PointerSwipeHostRef | undefined;
  /** Optional draggable SURFACE inside the host; presses outside it are chrome,
   * handed straight back. See ../README.md § Principle. */
  surfaceRef?: { readonly current: HTMLElement | null } | undefined;
  enabled?: boolean | undefined;
  config?: PointerSwipeConfig | undefined;
  /** Optional turnkey drag→value binding — see {@link PointerSwipeValueBinding}. */
  value?: PointerSwipeValueBinding | undefined;
  onPressStart?: ((payload: PointerSwipePressPayload) => void) | undefined;
  onDragStart?: ((payload: PointerSwipeMovePayload) => void) | undefined;
  onDragMove?: ((payload: PointerSwipeMovePayload) => void) | undefined;
  onRelease?: ((payload: PointerSwipeReleasePayload) => void) | undefined;
}

export interface PointerSwipeResult {
  /** Spread onto the host element: `<div {...hostProps}>` — ref, listeners
   * and required styles in one inseparable bundle. */
  hostProps: PointerSwipeHostProps;
}
