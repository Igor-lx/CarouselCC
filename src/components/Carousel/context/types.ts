import type { DevNoticeEntry } from "../../../shared";
import type { CarouselNavigation } from "../navigation";
import type { MotionPhase, MoveReason } from "../state";
import type { VisualPositionSource } from "../position";

export interface CarouselStatusView {
  motionPhase: MotionPhase;
  isIdle: boolean;
  isMoving: boolean;
  isJumping: boolean;
  isDragging: boolean;
  isInteracting: boolean;
}

export interface CarouselLayoutView {
  pageCount: number;
  canSlide: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  isTouch: boolean;
  isReducedMotion: boolean;
}

export interface CarouselIntentView {
  activePageIndex: number;
  targetPageIndex: number;
  moveReason: MoveReason;
  motionDuration: number;
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
  notices: DevNoticeEntry[];
  perfectPageLayout: {
    hasPerfectPageLayout: boolean;
    rawLength: number;
    extendedLength: number;
    visibleSlidesCount: number;
    didExtendLayout: boolean;
  };
  slotAttachment: {
    isControlsOn: boolean;
    hasControlsSlot: boolean;
    isPaginationOn: boolean;
    hasPaginationSlot: boolean;
  };
}
