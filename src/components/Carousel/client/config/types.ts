import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

export interface ReorientVeilTiming {
  /** Veil fade-out on rotation; needs extra time (starts mid-rotation). */
  fadeOutMs: number;
  /** Veil fade-in; also times the slow-load reveal. */
  fadeInMs: number;
  /** Fail-open cap — past it the veil lifts (must cover a full fade out + in). */
  veilMaxMs: number;
}

export interface ImageRetryPolicy {
  /** First backoff delay for a failed slide image. */
  baseDelayMs: number;
  /** Backoff ceiling (must be >= base). */
  maxDelayMs: number;
  /** Attempts before the slide gives up. */
  maxAttempts: number;
}

export interface CarouselInertialReleaseConfig extends InertialReleaseConfig {
  /** Release-ride ramp-up share. */
  accelerationDistanceShare: number;
  /** Release-ride ramp-down share (the smooth tail). */
  decelerationDistanceShare: number;
  /** Floor on the ride duration, so a flick cannot collapse to a teleport. */
  minRideDurationMs: number;
}

export interface SwipeCommitConfig {
  /** Commit distance as a fraction of one slot. */
  slotShare: number;
  /** Ergonomic floor on the commit distance (px). */
  minPx: number;
  /** Ergonomic ceiling on the commit distance (px). */
  maxPx: number;
}

export type CarouselSwipeConfig = Omit<
  Required<PointerSwipeConfig>,
  "minSwipeDistance" | "swipeThresholdRatio"
> & { commit: SwipeCommitConfig };

export interface PropDerivedSettings {
  /** Resolved slides per page. */
  visibleSlidesCount: number;
  /** Resolved autoplay-step duration (ms). */
  autoplayDuration: number;
  /** Resolved click / gesture base step duration (ms). */
  stepDuration: number;
  /** Resolved idle interval between autoplay steps (ms). */
  autoplayInterval: number;
  /** Resolved image-error placeholder text. */
  errorAltPlaceholder: string;
}

export interface MotionProfileSharesSettings {
  /** Ramp-up fraction of the travel. */
  accelerationDistanceShare: number;
  /** Ramp-down fraction of the travel. */
  decelerationDistanceShare: number;
}

export interface MotionSettings {
  /** Snap-back duration after a no-intent release. @see SNAP_BACK_DURATION_MS */
  snapBackDurationMs: number;
  /** Position tolerance for the motion settle. */
  epsilon: number;
  /** Click-step accel/decel shares. */
  stepProfile: MotionProfileSharesSettings;
  /** Autoplay-step accel/decel shares. */
  autoplayProfile: MotionProfileSharesSettings;
  /** Snap-back accel/decel shares. */
  snapBackProfile: MotionProfileSharesSettings;
  /** Page screens before a far-GO_TO teleport. @see GO_TO_PREFLIGHT_PAGE_SPAN */
  goToPreflightPageSpan: number;
  /** Master switch for the far-GO_TO teleport. @see GO_TO_TELEPORT_ENABLED */
  goToTeleportEnabled: boolean;
  /** Min intermediate pages from which a GO_TO flies. @see GO_TO_TELEPORT_MIN_PAGE_SPAN */
  goToTeleportMinPageSpan: number;
  /** Page screens after a far-GO_TO teleport. @see GO_TO_FINAL_APPROACH_PAGE_SPAN */
  goToFinalApproachPageSpan: number;
  /** GO_TO accel share, local to the first page screen. @see GO_TO_ACCELERATION_DISTANCE_SHARE */
  goToAccelerationDistanceShare: number;
  /** GO_TO decel share, local to the final page screen. @see GO_TO_DECELERATION_DISTANCE_SHARE */
  goToDecelerationDistanceShare: number;
  /** GO_TO peak cruise speed × the normal MOVE speed. @see GO_TO_SPEED_MULTIPLIER */
  goToSpeedMultiplier: number;
}

export interface RepeatedClickSettings {
  /** Fast-segment peak speed × a normal MOVE. @see REPEATED_CLICK_SPEED_MULTIPLIER */
  speedMultiplier: number;
  /** Fast-segment ramp-up share. */
  accelerationDistanceShare: number;
  /** Fast-segment ramp-down share. */
  decelerationDistanceShare: number;
}

export interface InteractionSettings {
  /** How long a desktop hover must hold before autoplay pauses. @see PAUSE_HOVER_DELAY_MS */
  hoverPauseDelayMs: number;
  /** Viewport share on screen below which autoplay pauses. @see PAUSE_VISIBILITY_RATIO */
  visibilityRatio: number;
  /** Quiet window after viewport activity before an autoplay tick (ms). */
  autoplayResettleDelayMs: number;
}

export interface LayoutSettings {
  /** Render-window buffer in page screens. @see RENDER_WINDOW_BUFFER_MULTIPLIER */
  renderWindowBufferMultiplier: number;
}

export interface CarouselRuntimeConfig extends PropDerivedSettings {
  motion: MotionSettings;
  repeatedClick: RepeatedClickSettings;
  interaction: InteractionSettings;
  layout: LayoutSettings;
  swipeConfig: CarouselSwipeConfig;
  releaseConfig: CarouselInertialReleaseConfig;
  /** Epsilon for drag-release target resolution. */
  dragReleaseEpsilon: number;
  /** Max coast-bridge interval across the commit gap (ms). @see GESTURE_COAST_MAX_MS */
  gestureCoastMaxMs: number;
}

export interface RawConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}
