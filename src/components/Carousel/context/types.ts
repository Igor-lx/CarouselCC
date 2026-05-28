import type { CarouselNavigation } from "../navigation";
import type { CarouselState, MotionPhase, MoveReason } from "../state";
import type { VisualPositionSource } from "../position";

export interface CarouselStatusView {
  motionPhase: MotionPhase;
  isIdle: boolean;
  isMoving: boolean;
  isJumping: boolean;
  isDragging: boolean;
}

export interface CarouselLayoutView {
  pageCount: number;
  canSlide: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  isTouch: boolean;
  isReducedMotion: boolean;
  isDiagnosticActive: boolean;
}

export interface CarouselIntentView {
  targetPageIndex: number;
  moveReason: MoveReason | null;
  autoplayMotionDuration: number;
  autoplayPaginationFactor: number;
}

export interface CarouselModuleContextValue {
  status: CarouselStatusView;
  layout: CarouselLayoutView;
  intent: CarouselIntentView;
  navigation: Pick<
    CarouselNavigation,
    "handlePrev" | "handleNext" | "handlePageSelect"
  >;
  visualPosition: VisualPositionSource | null;
}

export interface CarouselDiagnosticContextValue {
  state: CarouselState;
  props: {
    visibleSlidesNr: unknown;
    durationAutoplay: unknown;
    durationStep: unknown;
    jumpSpeedMultiplier: unknown;
    intervalAutoplay: unknown;
    errAltPlaceholder: unknown;
    userEnvironment: unknown;
  };
  layout: {
    rawLength: number;
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
  };
}
