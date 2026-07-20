import type { PointerSwipeConfig, PointerSwipeDirection } from "./gesture";
import type { MotionController } from "./motion";
import type { PointerSwipeHostProps } from "./gesture";

/** What the finger left behind — handed to a custom target policy. */
export interface KineticRelease {
  /** The value at the moment of release (the last dragged position). */
  from: number;
  /** The gesture's committed direction (flick / distance judged inside). */
  direction: PointerSwipeDirection;
  /** The visible speed at lift-off, pause-protected (units per ms). */
  launchVelocity: number;
  /** The drag's visual travel, px. */
  uiOffset: number;
}

export interface KineticConfig {
  /** Cruise speed of a programmatic `flyTo`, units per ms. */
  cruiseSpeed: number;
  /** Accel/decel distance shares of every ride's profile. */
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
  /** Free-glide momentum window: a release travels `velocity × this` further. */
  glideMomentumMs: number;
  /** Below this release speed the value simply rests where it was dropped. */
  minGlideSpeed: number;
  /** Pass-through tuning for the embedded gesture engine. */
  swipe?: PointerSwipeConfig;
}

export interface UseKineticValueInput {
  /** THE domain function: what a value looks like. Style-property shape
   * (`transform`, `opacity`, …) — serves the paint, the WAAPI keyframes and
   * the pins alike. */
  keyframe: (value: number) => Keyframe;
  initialValue?: number;
  enabled?: boolean;
  config?: Partial<KineticConfig>;
  /**
   * Optional target policy. Absent — the built-in momentum glide. Present —
   * it fully owns the landing: return the target value, or `null` to rest
   * where released (e.g. snap grids: `Math.round(from / step) * step`).
   */
  resolveTarget?: (release: KineticRelease) => number | null;
  /** Fires when any ride (glide, flyTo, snap) settles. */
  onSettle?: (value: number) => void;
}

export interface KineticValue {
  /** Spread onto the SURFACE element (the area that owns the finger). */
  hostProps: PointerSwipeHostProps;
  /** Ref for the MOVING element (the thing the keyframe styles). */
  ref: (node: HTMLElement | null) => void;
  /** Programmatic ride (buttons, external commands). Mid-flight calls
   * retarget velocity-continuously. */
  flyTo: (to: number) => void;
  /** Freeze at the live position (kills any ride). */
  stop: () => void;
  /** The live value — sampled from the running curve, never the DOM. */
  value: () => number;
  /** Escape hatch: the underlying controller, for anything beyond the blank. */
  controller: MotionController;
}
