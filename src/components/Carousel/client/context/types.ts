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
  /** Slides per page — modules mapping pages to slides (pagination, the
   * predecode window). */
  visibleSlidesCount: number;
  isFinite: boolean;
  canSlide: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  isTouch: boolean;
  isReducedMotion: boolean;
  /** Host reduced-data signal — the slide fetch respects it (off-band images
   * load lazily and at low priority; see SlideItem). */
  isDataSaverEnabled: boolean;
  /**
   * True when a Diagnostic slot is attached. Modules with their own checks
   * (e.g. PaginationWidget) gate diagnostic work on this flag so the carousel
   * incurs zero diagnostic overhead when no Diagnostic slot is mounted.
   */
  isDiagnosticActive: boolean;
}

export interface CarouselIntentView {
  /** Normalised destination page `[0, pageCount)`. Pagination marks this dot
   * active immediately on every command; temporal presentation (the dot
   * cross-fade, the widget step) rides the motion plan instead. */
  targetPageIndex: number;
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
/**
 * Per-slide art-direction descriptor (deck order, page-padding clones
 * included), image slides only. Its ONLY consumer is the Diagnostic slot,
 * which checks that each slide's `<source media>` string is one of the
 * carousel's canonical axis strings — so a crop can never silently flip on a
 * threshold the slide box does not (see `collectSlideSourceMediaWarnings`).
 * Hence the sole field is `sources`; it is built only in development (there is
 * no production consumer).
 */
export interface CarouselSlideMediaView {
  /** The slide's art-directed `<source>`s (their `media` is what is audited). */
  sources?: readonly SlideImageSource[];
}

export interface CarouselStableContextValue {
  layout: CarouselLayoutView;
  navigation: CarouselNavigationView;
  visualPosition: VisualPositionSource | null;
  /**
   * The engine's motion-plan stream (see `motion/planChannel.ts`): each
   * non-drag motion is computed once and published as duration + percent
   * progress curve; a paint consumer (PaginationWidget) builds its own WAAPI
   * animation from it. `null` when reduced motion is on — modules fall back
   * to their static rendering.
   */
  motionPlan: MotionPlanSource | null;
  /** Deck-order media descriptors (empty when image content is off). */
  slides: readonly CarouselSlideMediaView[];
  /**
   * The track element. Handed to modules that must read what the deck has
   * ACTUALLY rendered rather than re-derive it — `<ResponsiveImages>` takes
   * the buffered `<img>`s' `currentSrc` from here, which is the browser's own
   * candidate choice and cannot disagree with the markup the way a parallel
   * computation can. A ref object is referentially stable, so exposing it
   * costs no re-render.
   */
  trackRef: RefObject<HTMLDivElement | null>;
  /**
   * Bandwidth gate (see `useActiveBandGate`): `true` once the visible band has
   * reported back and the buffered slides are allowed to fetch. Modules read
   * it as "the buffer exists now" — before it flips, the buffer's `<img>`s are
   * not mounted at all.
   */
  isOffBandFetchOn: boolean;
  /**
   * Whether the <Pagination> dots accept clicks (the `isPaginationInteractiveOn`
   * public prop). A slot child cannot be handed props by the carousel, so this
   * behaviour flag reaches the module through the stable context. Off renders
   * the dots as inert `<div>`s — see PaginationDot.
   */
  isPaginationInteractiveOn: boolean;
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
    intervalAutoplay: unknown;
    errAltPlaceholder: unknown;
    userEnvironment: unknown;
  };
  layout: {
    rawLength: number;
    /** The count the caller asked for (resolved config, pre-clamp). When it
     * exceeds the deck length the runtime coerces it down — a correct
     * adaptation the Diagnostic layer surfaces via `collectLayoutWarnings`. */
    requestedVisibleSlidesCount: number;
    /** The EFFECTIVE count actually used: `min(requested, rawLength)`. */
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
