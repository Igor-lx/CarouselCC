import type { CarouselNavigation } from "../navigation";
import type { MotionPhase, MoveReason } from "../state";
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
  /**
   * True when a Diagnostic slot is attached. Modules with their own checks
   * (e.g. PaginationWidget) gate diagnostic work on this flag so the carousel
   * incurs zero diagnostic overhead when no Diagnostic slot is mounted.
   */
  isDiagnosticActive: boolean;
}

export interface CarouselIntentView {
  targetPageIndex: number;
  /** `null` before the carousel has moved for the first time. */
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

/**
 * Inputs the Diagnostic slot reads to produce dev-only warnings. The values
 * mirror what the runtime sees; the Diagnostic layer must never read mutated
 * or filtered copies, otherwise its observations would diverge from reality.
 */
export interface CarouselDiagnosticContextValue {
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
    pageCount: number;
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
  /**
   * Live reducer-state fields needed for structural-invariant checks (see
   * `state/validateState.ts`). Diagnostic is the single emission point for
   * these warnings; the reducer stays pure.
   */
  state: {
    targetPageIndex: number;
    motionPhase: MotionPhase;
    teleportVirtualIndex: number | null;
    isTeleportApproach: boolean;
  };
}
