import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type PointerSwipePhase = "idle" | "press" | "dragging" | "cooldown";

export type PointerSwipeDirection = "left" | "right" | "none";

/**
 * How an owned gesture ended. The distinction carries MEANING for a consumer
 * that brakes motion on the press (catch-and-hold):
 *  - "release": the finger lifted — a deliberate hold ends here (and a
 *    long-press menu also ends here on iOS);
 *  - "vertical-scroll": the engine itself recognised vertical intent — the
 *    touch was a page scroll crossing the surface, never a catch;
 *  - "external-cancel": the browser stole the pointer (native pan already in
 *    progress, a context menu opening, a system gesture). On Android the
 *    long-press menu arrives THIS way, so consumers that must tell "menu"
 *    from "scroll" watch the `contextmenu` event alongside.
 */
export type PointerSwipeEndReason = "release" | "vertical-scroll" | "external-cancel";

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
  /** UI-domain speed a continuity launch should start at — judged over the
   * whole gesture, not the last frames (a momentary hold zeroes the raw
   * `uiReleaseVelocity`, which would launch from a standstill). */
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

/**
 * Turnkey "the finger drags your value" — the binding that removes the last
 * consumer-side drag boilerplate (the anchor ref and the per-move write).
 *
 * When present, the engine anchors itself at drag ACTIVATION (`read()`) and
 * calls `write(anchor + uiOffset)` on activation and on every move. The
 * anchor is read at activation, not at press: `uiOffset` is measured from
 * the finger's re-anchored position and starts at ~0 there, so the first
 * write equals `read()` — the value continues from exactly where it was,
 * whatever the OS swallowed as touch slop.
 *
 * The binding is 1:1 with the finger: one pixel of travel is one unit of
 * value. A consumer whose value lives in another unit (the carousel's
 * slot-adaptive pixels→slides mapping) keeps the plain callbacks — a unit
 * conversion is domain knowledge the engine must not guess.
 *
 * `write` is where a motion-library consumer plugs its controller
 * (`controller.set(v, { phase: "dragging" })`), and `read` is where a flying
 * value gets caught: cancel the ride inside `read` and return the live
 * position — the drag then picks the value up mid-flight without a seam.
 * The callbacks (`onDragStart`/`onDragMove`) still fire after each write.
 */
export interface PointerSwipeValueBinding {
  /** The value's live position at drag activation — the drag's anchor. */
  read: () => number;
  /** Receives `anchor + uiOffset` on activation and on every move. */
  write: (value: number) => void;
}

export interface PointerSwipeProps {
  /**
   * OPTIONAL consumer ref: the engine owns the host element itself through
   * `hostProps.ref` and forwards the node here, so a consumer that also
   * needs the element (visibility, focus, measurement) does not wire a
   * second ref onto the DOM node.
   */
  hostRef?: PointerSwipeHostRef;
  /**
   * OPTIONAL: the draggable SURFACE inside the host. When given (and
   * mounted), only presses landing INSIDE this subtree are the engine's
   * business — everything else under the host is CHROME (arrows, overlays,
   * toolbars) and is handed straight back: no pointer capture, no ownership,
   * no brake, no drag, no phase change, and its click is never swallowed by
   * the post-swipe cooldown. A press on chrome leaves a running ride exactly
   * as it was, just like a press on an element outside the host.
   *
   * Declaring the surface POSITIVELY is what makes chrome safe by
   * construction: a control added inside the host later is excluded
   * automatically, with nothing to remember to mark. Omit it (or leave the
   * ref empty) and the whole host is the surface — the default, unchanged.
   */
  surfaceRef?: { readonly current: HTMLElement | null };
  enabled?: boolean;
  config?: PointerSwipeConfig;
  /** Optional turnkey drag→value binding — see {@link PointerSwipeValueBinding}. */
  value?: PointerSwipeValueBinding;
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
