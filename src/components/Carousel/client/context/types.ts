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
 *
 * `state` is the full effective `CarouselState` (carrying its own `layout`),
 * so the structural-invariant validator can consume it directly without an
 * extra sub-view; `layout` exposes only the layout-shape metrics the
 * Diagnostic layer presents on top.
 */
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
