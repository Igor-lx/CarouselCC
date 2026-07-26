// See docs/architecture/context.md
import type { RefObject } from "react";
import type { MotionPlanSource } from "../motion";
import type { SlideImageSource } from "../public-api/types";
import type { CarouselNavigation } from "../navigation";
import type { CarouselState, MotionPhase } from "../state";
import type { VisualPositionSource } from "../visual-position";

export interface CarouselStatusView {
  motionPhase: MotionPhase;
  isIdle: boolean;
  isMoving: boolean;
  isJumping: boolean;
  isDragging: boolean;
}

export interface CarouselLayoutView {
  pageCount: number;
  /** Slides per page. */
  visibleSlidesCount: number;
  isFinite: boolean;
  canSlide: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  isTouch: boolean;
  isReducedMotion: boolean;
  /** Host reduced-data signal — the slide fetch respects it (see SlideItem). */
  isDataSaverEnabled: boolean;
  /** A Diagnostic slot is attached; modules gate their own checks on it. */
  isDiagnosticActive: boolean;
}

export interface CarouselIntentView {
  /** Normalised destination page `[0, pageCount)`. */
  targetPageIndex: number;
}

export type CarouselNavigationView = Pick<
  CarouselNavigation,
  "handlePrev" | "handleNext" | "handlePageSelect"
>;

/** Per-slide art-direction descriptor (image slides only); consumed only by the
 * dev Diagnostic slot to audit each `<source media>` string. */
export interface CarouselSlideMediaView {
  sources?: readonly SlideImageSource[];
}

/** The stable / low-frequency context half (see doc). */
export interface CarouselStableContextValue {
  layout: CarouselLayoutView;
  navigation: CarouselNavigationView;
  visualPosition: VisualPositionSource | null;
  /** Engine motion-plan stream; `null` under reduced motion. */
  motionPlan: MotionPlanSource | null;
  slides: readonly CarouselSlideMediaView[];
  /** The track element — modules read the deck's actually-rendered DOM from it. */
  trackRef: RefObject<HTMLDivElement | null>;
  /** Bandwidth gate: `true` once buffered slides may fetch (see useActiveBandGate). */
  isOffBandFetchOn: boolean;
  /** Whether the dots accept clicks (isPaginationInteractiveOn). */
  isPaginationInteractiveOn: boolean;
}

/** The high-frequency context half — re-identifies on every transition. */
export interface CarouselMotionContextValue {
  status: CarouselStatusView;
  intent: CarouselIntentView;
}

/** Runtime-mirroring inputs the dev Diagnostic slot reads (never mutated copies). */
export interface CarouselDiagnosticContextValue {
  state: CarouselState;
  props: {
    visibleSlidesNr: unknown;
    durationAutoplay: unknown;
    durationStep: unknown;
    intervalAutoplay: unknown;
    errAltPlaceholder: unknown;
    userEnvironment: unknown;
  };
  layout: {
    rawLength: number;
    /** The count the caller asked for (resolved config, pre-clamp). */
    requestedVisibleSlidesCount: number;
    /** The effective count used: `min(requested, rawLength)`. */
    visibleSlidesCount: number;
    extendedLength: number;
    didExtendLayout: boolean;
    hasPerfectPageLayout: boolean;
    canSlide: boolean;
  };
  slots: {
    isControlsOn: boolean;
    hasControlsSlot: boolean;
    isPaginationOn: boolean;
    hasPaginationSlot: boolean;
    /** Whether the <Pagination> dots accept clicks (isPaginationInteractiveOn). */
    isPaginationInteractiveOn: boolean;
    hasResponsiveImagesSlot: boolean;
    /** Any slide in the deck carries image variants (srcSet / sources). */
    deckCarriesImageSets: boolean;
  };
}
