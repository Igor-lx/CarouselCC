// Composition root — see docs/architecture/overview.md
import { memo, useImperativeHandle, useMemo, useRef } from "react";

import styles from "./Carousel.module.scss";
import { resolveSlots } from "../../../shared";
import { CAROUSEL_DEFAULTS, useCarouselConfig } from "./config";
import {
  CarouselDiagnosticContext,
  CarouselMotionContext,
  CarouselStableContext,
  useDiagnosticContextValue,
  useModuleContextValue,
  type CarouselSlideMediaView,
} from "./context";
import {
  carouselBoundaryState,
  deckCarriesImageSets,
  laneDistanceFromBand,
} from "./domain";
import { useCarouselAutoplay } from "./autoplay/useCarouselAutoplay";
import { useFocusRecovery } from "./focus/useFocusRecovery";
import { useCarouselGesture } from "./gesture";
import {
  resolveImageSizes,
  useSlotSizeSource,
  useTrackBinding,
} from "./geometry";
import {
  createMotionPlanChannel,
  useCarouselMotionExecution,
  type MotionPlanChannel,
} from "./motion";
import { useCarouselNavigation } from "./navigation";
import { useVisualPosition } from "./visual-position";
import { areCarouselPropsEqual } from "./areCarouselPropsEqual";
import { useModuleRenderPolicy } from "./render-policy/useModuleRenderPolicy";
import { useCarouselPresentation } from "./presentation";
import { useSlideViewport } from "./viewport/useSlideViewport";
import {
  SlideItem,
  useCarouselSlideDeck,
  useImageResourceStore,
  useSlideFetchReach,
  useSlideRenderModel,
} from "./slides";
import { CAROUSEL_SLOTS } from "./slots";
import { useCarouselState } from "./state";
import { useCarouselStatusReporter } from "./host-report/useCarouselStatusReporter";
import type { CarouselProps } from "./public-api/types";

const IS_DEV = import.meta.env.DEV; // gates the dev-only slide media descriptors

const EMPTY_SLIDE_MEDIA: CarouselSlideMediaView[] = [];

const Carousel = memo(function Carousel(props: CarouselProps) {
  const {
    slidesData,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    intervalAutoplay,
    errAltPlaceholder,
    isFullPagesOn = CAROUSEL_DEFAULTS.isFullPagesOn,
    isContentImg = CAROUSEL_DEFAULTS.isContentImg,
    isAutoplayOn = CAROUSEL_DEFAULTS.isAutoplayOn,
    isPaginationOn = CAROUSEL_DEFAULTS.isPaginationOn,
    isSlideInteractiveOn = CAROUSEL_DEFAULTS.isSlideInteractiveOn,
    isPaginationInteractiveOn = CAROUSEL_DEFAULTS.isPaginationInteractiveOn,
    isFinite: isFiniteProp = CAROUSEL_DEFAULTS.isFinite,
    isControlsOn = CAROUSEL_DEFAULTS.isControlsOn,
    isSwipeOn = CAROUSEL_DEFAULTS.isSwipeOn,
    className,
    userEnvironment,
    onSlideClick,
    onCarouselStatusChange,
    children,
    ref,
  } = props;

  // --- environment (injected, never self-detected) --------------------------
  const isInstantMode = userEnvironment?.reducedMotion ?? false;
  const isTouch = userEnvironment?.touch ?? false;
  const isDataSaverEnabled = userEnvironment?.dataSaver ?? false;

  // --- slots ----------------------------------------------------------------
  const slots = useMemo(
    () => resolveSlots(children, CAROUSEL_SLOTS),
    [children],
  );

  // The responsive-image stack is switched by the <ResponsiveImages> slot's presence.
  const isResponsiveImagesOn = Boolean(slots["responsive-images"]);

  const slideViewport = useSlideViewport();

  // --- resolved runtime config (no diagnostic dependency) ------------------
  const config = useCarouselConfig({
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    intervalAutoplay,
    errAltPlaceholder,
  });

  // --- slide deck + layout --------------------------------------------------
  const { records, layout, perfectPageLayoutInfo } = useCarouselSlideDeck({
    slidesData,
    visibleSlidesCount: config.visibleSlidesCount,
    isFinite: isFiniteProp,
    isFullPagesOn,
  });

  // --- logical state machine ------------------------------------------------
  const { state, status, dispatch } = useCarouselState({
    layout,
    config,
    isInstantMode,
  });

  // --- boundary state (shared by status, motion, autoplay) ------------------
  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex],
  );

  // Art-direction descriptors — dev Diagnostic slot only (never runs shipped).
  const slideMediaViews = useMemo<CarouselSlideMediaView[]>(
    () =>
      IS_DEV && isContentImg
        ? records.flatMap((record) =>
            typeof record.slideData.content === "string"
              ? [{ sources: record.slideData.image?.sources }]
              : [],
          )
        : EMPTY_SLIDE_MEDIA,
    [isContentImg, records],
  );

  const hasDeckImageSets = useMemo(
    () => deckCarriesImageSets(records),
    [records],
  );

  const imageResourceStore = useImageResourceStore({
    isContentImg,
    records,
    isResponsiveImagesOn,
  });

  // --- DOM refs (before imageSizes, which measures the viewport) ------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // THE slot measurement: one observer for the track, the gesture and `sizes`.
  const slotSize = useSlotSizeSource({
    viewportRef,
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  const imageSizes = resolveImageSizes({
    slotPx: slotSize.slotPx,
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  useCarouselStatusReporter({
    onCarouselStatusChange,
    isIdle: status.isIdle,
    targetPageIndex: state.targetPageIndex,
    pageCount: layout.pageCount,
    isAtStart,
    isAtEnd,
  });

  // --- visual position SSOT -------------------------------------------------
  const {
    source: visualPosition,
    controller,
    applyImmediatePosition,
  } = useVisualPosition({
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  // --- render model: virtual slides + render window -------------------------
  const { virtualSlides, layoutOrigin } = useSlideRenderModel({
    current: state.virtualIndex,
    previous: state.fromVirtualIndex,
    // Non-idle INCLUDING dragging: a catch-and-hold at a fractional position must
    // not let the active band go inert under the finger (breaks the long-press menu).
    isMoving: !status.isIdle,
    layout,
    records,
    renderWindowBufferMultiplier: config.layout.renderWindowBufferMultiplier,
  });

  // How far outside the band a slide may fetch: the band only, then the whole
  // buffer once the deck is both loaded and still (see the hook).
  const slideFetchReach = useSlideFetchReach({
    virtualSlides,
    isContentImg,
    isResponsiveImagesOn,
    imageResourceStore,
    isIdle: status.isIdle,
  });
  const isOffBandFetchOn = Number.isFinite(slideFetchReach) === false;

  // --- motion plan channel ---------------------------------------------------
  // Created before the track binding, which subscribes to it (see below).
  const planChannelRef = useRef<MotionPlanChannel | null>(null);
  if (planChannelRef.current === null) {
    planChannelRef.current = createMotionPlanChannel();
  }
  const planChannel = planChannelRef.current;

  // --- track DOM bridge -----------------------------------------------------
  const {
    readCurrentPosition,
    getSlotSize,
    startCompositorMotion,
    cancelCompositorMotion,
  } = useTrackBinding({
    trackRef,
    layoutOrigin,
    visibleSlidesCount: layout.visibleSlidesCount,
    visualPosition,
    slotSize,
    motionPlan: planChannel.source,
  });

  // --- motion execution: state -> controller --------------------------------
  useCarouselMotionExecution({
    state,
    config,
    controller,
    dispatch,
    isInstantMode,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan: planChannel.publish,
  });

  // --- navigation -----------------------------------------------------------
  const navigation = useCarouselNavigation({
    enabled: layout.canSlide,
    dispatch,
    readCurrentPosition,
    onSlideClick,
  });

  // --- imperative handle (same pipeline as <Controls>) ----------------------
  useImperativeHandle(
    ref,
    () => ({
      prev: navigation.handlePrev,
      next: navigation.handleNext,
    }),
    [navigation.handlePrev, navigation.handleNext],
  );

  // --- gesture --------------------------------------------------------------
  const { hostProps: dragHostProps } = useCarouselGesture({
    viewportRef,
    trackRef,
    layout,
    isSwipeOn,
    inFlightTargetPageIndex: status.isIdle ? null : state.targetPageIndex,
    dispatch,
    readCurrentPosition,
    applyTrackPosition: applyImmediatePosition,
    cancelTrackMotion: cancelCompositorMotion,
    getSlotSize,
    slotPx: slotSize.slotPx,
    config,
  });

  // --- autoplay (visibility-aware) ------------------------------------------
  const { handleHoverChange } = useCarouselAutoplay({
    state,
    config,
    navigation,
    isAutoplayOn,
    isTouch,
    isAtEnd,
    viewportRef,
  });

  // --- focus recovery after settle -----------------------------------------
  useFocusRecovery({
    containerRef: viewportRef,
    isIdle: status.isIdle,
    targetPageIndex: state.targetPageIndex,
  });

  // --- module render policy & values (moduleSlots are already gated) --------
  const renderPolicy = useModuleRenderPolicy({
    controlsSlot: slots.controls,
    paginationSlot: slots.pagination,
    diagnosticSlot: slots.diagnostic,
    responsiveImagesSlot: slots["responsive-images"],
    isControlsOn,
    isPaginationOn,
    canSlide: layout.canSlide,
  });
  const moduleSlots = renderPolicy.slots;

  const { stable: stableContextValue, motion: motionContextValue } =
    useModuleContextValue({
      state,
      navigation,
      isTouch,
      isReducedMotion: isInstantMode,
      isDataSaverEnabled,
      slides: slideMediaViews,
      trackRef,
      isOffBandFetchOn,
      visualPosition: isInstantMode ? null : visualPosition,
      motionPlan: isInstantMode ? null : planChannel.source,
      isAtStart,
      isAtEnd,
      isDiagnosticActive: renderPolicy.isDiagnosticActive,
      isPaginationInteractiveOn,
    });

  // --- diagnostic context ---------------------------------------------------
  const diagnosticContextValue = useDiagnosticContextValue({
    state,
    slidesData,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    intervalAutoplay,
    errAltPlaceholder,
    userEnvironment,
    rawLength: perfectPageLayoutInfo.rawLength,
    extendedLength: perfectPageLayoutInfo.extendedLength,
    didExtendLayout: perfectPageLayoutInfo.didExtendLayout,
    hasPerfectPageLayout: perfectPageLayoutInfo.hasPerfectPageLayout,
    requestedVisibleSlidesCount: config.visibleSlidesCount,
    visibleSlidesCount: layout.visibleSlidesCount,
    canSlide: layout.canSlide,
    isControlsOn,
    hasControlsSlot: renderPolicy.hasControlsSlot,
    isPaginationOn,
    hasPaginationSlot: renderPolicy.hasPaginationSlot,
    isPaginationInteractiveOn,
    hasResponsiveImagesSlot: renderPolicy.hasResponsiveImagesSlot,
    deckCarriesImageSets: hasDeckImageSets,
  });

  // --- presentation payload (classes, CSS vars, state attributes) ----------
  const {
    classNames,
    slideClassMap,
    rootStyle,
    slideStyleFor,
    flagAttributes,
  } = useCarouselPresentation({
    className,
    visibleSlidesCount: layout.visibleSlidesCount,
    virtualSlides,
    layoutOrigin,
    flags: slideViewport.flags,
  });

  return (
    <CarouselStableContext.Provider value={stableContextValue}>
      <CarouselMotionContext.Provider value={motionContextValue}>
        <CarouselDiagnosticContext.Provider value={diagnosticContextValue}>
          <div
            className={classNames.outerContainer}
            style={rootStyle}
            data-responsive-images={isResponsiveImagesOn}
            role="region"
            aria-roledescription="carousel"
            data-carousel-root=""
            data-touch={isTouch}
            data-reduced-motion={isInstantMode}
            // Suppresses the non-compositable slide-outline transition during a ride.
            data-moving={!status.isIdle}
            // Viewport axes as the styling contract (see viewport.md); flags add data-<flag>.
            data-breakpoint={slideViewport.breakpoint}
            data-orientation={slideViewport.orientation}
            {...flagAttributes}
          >
            <div
              tabIndex={-1}
              className={classNames.innerContainer}
              data-carousel-viewport=""
              onMouseEnter={() => handleHoverChange(true)}
              onMouseLeave={() => handleHoverChange(false)}
              // ref + listeners + engine styles in one bundle (engine forwards to viewportRef).
              {...dragHostProps}
            >
              <div
                ref={trackRef}
                className={classNames.slideContainer}
                data-carousel-track=""
              >
                <div aria-hidden="true" className={styles.slideSizer} />
                {virtualSlides.map((slide) => (
                  <SlideItem
                    key={slide.slideKey}
                    slideData={slide.slideData}
                    className={slideClassMap}
                    style={slideStyleFor(slide.virtualIndex)}
                    isContentImg={isContentImg}
                    isResponsiveImagesOn={isResponsiveImagesOn}
                    errAltPlaceholder={config.errAltPlaceholder}
                    isInteractiveOn={isSlideInteractiveOn}
                    isActive={slide.isActive}
                    isActual={slide.isActual}
                    // `isActive`, not `isActual`: mid-ride the slides being
                    // ridden AWAY from are still on screen, and a slide on
                    // screen keeps its image. Keyed on the destination band
                    // alone, they went blank for the length of the ride.
                    isFetchOn={
                      slide.isActive ||
                      laneDistanceFromBand(
                        slide.virtualIndex,
                        state.virtualIndex,
                        layout.visibleSlidesCount,
                      ) <= slideFetchReach
                    }
                    isDataSaverEnabled={isDataSaverEnabled}
                    imageResourceStore={imageResourceStore}
                    imageSizes={imageSizes}
                    viewportSignature={slideViewport.signature}
                    onSlideClick={navigation.handleSlideClick}
                    {...slide.ariaProps}
                  />
                ))}
              </div>
              {moduleSlots.controls}
            </div>
            {moduleSlots.pagination}
            {moduleSlots.responsiveImages}
            {moduleSlots.diagnostic}
          </div>
        </CarouselDiagnosticContext.Provider>
      </CarouselMotionContext.Provider>
    </CarouselStableContext.Provider>
  );
}, areCarouselPropsEqual);

export default Carousel;
