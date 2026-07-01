import type { CarouselNavigation } from "../navigation";
import type { CarouselState, MotionPhase, MoveReason } from "../state";
import type { MotionPlanSource, VisualPositionSource } from "../position";

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
  /** Normalised destination page `[0, pageCount)`, for pagination labelling. */
  targetPageIndex: number;
  /**
   * Destination in the *unbounded* page-offset domain (`virtualIndex /
   * visibleSlidesCount`) — the same domain the visual-position stream reports
   * `pageOffset` in. In cyclic mode this keeps growing/shrinking past the deck
   * edges while `targetPageIndex` wraps, so anything that must stay aligned with
   * the live `pageOffset` (e.g. the widget's dot window) must anchor here.
   */
  targetPageOffset: number;
  /** `null` before the carousel has moved for the first time. */
  moveReason: MoveReason | null;
  autoplayMotionDuration: number;
  autoplayPaginationFactor: number;
}

export type CarouselNavigationView = Pick<
  CarouselNavigation,
  "handlePrev" | "handleNext" | "handlePageSelect"
>;

/**
 * Module context partitioned by update cadence so a high-frequency change never
 * re-renders consumers of low-frequency data.
 *
 * `CarouselStableContextValue` is the **stable / low-frequency** half — "stable"
 * meaning it changes rarely, not never: `navigation` is referentially fixed for
 * the carousel's life, `visualPosition` changes only when reduced-motion
 * toggles, and `layout` re-identifies only on a boundary/config change (e.g.
 * reaching the deck edge, a data replacement) — never on an ordinary mid-deck
 * step. A consumer that reads only this half (e.g. `<Controls>`, the widget
 * diagnostic) does not re-render on every click.
 */
export interface CarouselStableContextValue {
  layout: CarouselLayoutView;
  navigation: CarouselNavigationView;
  visualPosition: VisualPositionSource | null;
  /**
   * Compositor motion-plan mirror (see `MotionPlanSource`). `null` when motion
   * is instant (reduced-motion), exactly like `visualPosition`, so a consumer
   * uses the same gate to decide composited-vs-static. Referentially stable.
   */
  motionPlan: MotionPlanSource | null;
}

/**
 * The **high-frequency** half: `status` (motion phase / idle / moving …) and
 * `intent` (target page, move reason) change on every click, gesture, and
 * settle. Consumers that read this half (`<Pagination>`, `<PaginationWidget>`)
 * legitimately re-render on those transitions — that is their job.
 */
export interface CarouselMotionContextValue {
  status: CarouselStatusView;
  intent: CarouselIntentView;
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
