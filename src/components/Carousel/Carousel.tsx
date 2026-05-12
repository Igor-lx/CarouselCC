import { memo, useMemo, useRef, useState } from "react";

import styles from "./Carousel.module.scss";
import {
  mergeStyleMaps,
  resolveSlots,
  useIsReducedMotion,
  useIsTouchDevice,
  useViewportVisibility,
} from "../../shared";
import { CAROUSEL_DEFAULTS, useCarouselConfig } from "./config";
import {
  CarouselDiagnosticContext,
  CarouselModuleContext,
  useModuleContextValue,
} from "./context";
import { carouselBoundaryState, slideFlexStyle } from "./domain";
import { useAutoplay } from "./autoplay/useAutoplay";
import { useFocusRecovery } from "./focus/useFocusRecovery";
import { useCarouselGesture } from "./gesture";
import { useTrackBinding } from "./geometry";
import { useMotionRunner } from "./motion";
import { useCarouselNavigation } from "./navigation";
import { useVisualPosition } from "./position";
import { useModuleRenderPolicy } from "./render-policy/useModuleRenderPolicy";
import { SlideItem, useCarouselSlideDeck, useSlideRenderModel } from "./slides";
import { CAROUSEL_SLOTS } from "./slots";
import { motionStatus, useCarouselState } from "./state";
import {
  SLIDE_CLASS_KEYS,
  type CarouselProps,
  type SlideClassMap,
} from "./types";

const Carousel = memo(function Carousel(props: CarouselProps) {
  const {
    slidesData,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    durationJump,
    intervalAutoplay,
    errAltPlaceholder,
    isPagePaddingOn = CAROUSEL_DEFAULTS.isPagePaddingOn,
    isContentImg = CAROUSEL_DEFAULTS.isContentImg,
    isAuto = CAROUSEL_DEFAULTS.isAuto,
    isPaginationOn = CAROUSEL_DEFAULTS.isPaginationOn,
    isInteractive = CAROUSEL_DEFAULTS.isInteractive,
    isFinite: isFiniteProp = CAROUSEL_DEFAULTS.isFinite,
    isControlsOn = CAROUSEL_DEFAULTS.isControlsOn,
    className,
    isInstantMotion,
    isTouchDevice,
    onSlideClick,
    children,
  } = props;

  // --- environment & overrides ----------------------------------------------
  const prefersReducedMotion = useIsReducedMotion();
  const detectedTouchDevice = useIsTouchDevice();
  const isInstantMode = isInstantMotion ?? prefersReducedMotion;
  const isTouch = isTouchDevice ?? detectedTouchDevice;

  // --- slots ----------------------------------------------------------------
  const slots = useMemo(() => resolveSlots(children, CAROUSEL_SLOTS), [children]);

  // --- resolved runtime config ---------------------------------------------
  const { config, notices } = useCarouselConfig({
    diagnosticSlot: slots.diagnostic,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    durationJump,
    intervalAutoplay,
    errAltPlaceholder,
    isTouch,
  });

  // --- slide deck + layout --------------------------------------------------
  const { records, layout, perfectPageLayoutInfo } = useCarouselSlideDeck({
    slidesData,
    visibleSlidesCount: config.visibleSlidesCount,
    isFinite: isFiniteProp,
    isPagePaddingOn,
  });

  // --- logical state machine ------------------------------------------------
  const { state, status, dispatch } = useCarouselState({
    layout,
    config,
    isInstantMode,
  });

  // --- visual position SSOT -------------------------------------------------
  const { source: visualPosition, controller } = useVisualPosition({
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  // --- render model: virtual slides + render window -------------------------
  const { virtualSlides, renderWindowStart } = useSlideRenderModel({
    current: state.virtualIndex,
    previous: state.fromVirtualIndex,
    isMoving: status.isMoving,
    layout,
    records,
    renderWindowBufferMultiplier: config.layout.renderWindowBufferMultiplier,
  });

  // --- DOM refs --------------------------------------------------------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // --- track DOM bridge -----------------------------------------------------
  const { applyTrackPosition, readCurrentPosition, getSlotSize } = useTrackBinding({
    trackRef,
    renderWindowStart,
    visibleSlidesCount: layout.visibleSlidesCount,
    visualPosition,
  });

  // --- motion runner: state ↔ controller -----------------------------------
  const [motionDuration, setMotionDuration] = useState(0);
  useMotionRunner({
    state,
    config,
    controller,
    isInstantMode,
    isDragging: status.isDragging,
    enabled: layout.canSlide,
    onSettle: () => dispatch({ type: "MOTION_SETTLED" }),
    onDurationChange: setMotionDuration,
  });

  // --- navigation -----------------------------------------------------------
  const navigation = useCarouselNavigation({
    enabled: layout.canSlide,
    dispatch,
    readCurrentPosition,
    onSlideClick,
  });

  // --- gesture --------------------------------------------------------------
  const { isDragging, isInteracting, listeners: dragListeners } = useCarouselGesture({
    enabled: layout.canSlide,
    viewportRef,
    layout,
    dispatch,
    readCurrentPosition,
    applyTrackPosition,
    getSlotSize,
    config,
  });
  void isDragging; // included in status via dispatched START_DRAG/END_DRAG

  // --- visibility (for autoplay pause) -------------------------------------
  const visible = useViewportVisibility({
    elementRef: viewportRef,
    threshold: config.interaction.visibilityThreshold,
  });

  // --- boundary state -------------------------------------------------------
  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex],
  );

  // --- autoplay -------------------------------------------------------------
  const autoplayPaused = !visible || isInteracting || status.isMoving;
  const { handleHoverChange } = useAutoplay({
    enabled: isAuto && layout.canSlide && !isInstantMode,
    isPaused: autoplayPaused,
    isAtEnd,
    intervalMs: config.autoplayInterval,
    hoverPauseDelayMs: config.interaction.hoverPauseDelay,
    ignoreHover: isTouch,
    onStep: () => navigation.move(1, "autoplay"),
    onGoToStart: () => navigation.goTo(0, "autoplay"),
  });

  // --- focus recovery after settle -----------------------------------------
  useFocusRecovery({
    containerRef: viewportRef,
    isIdle: status.isIdle,
    activePageIndex: state.targetPageIndex,
  });

  // --- module render policy & values ---------------------------------------
  const renderPolicy = useModuleRenderPolicy({
    controlsSlot: slots.controls,
    paginationSlot: slots.pagination,
    isControlsOn,
    isPaginationOn,
    canSlide: layout.canSlide,
  });

  const moduleContextValue = useModuleContextValue({
    state,
    status: useMemo(() => motionStatus(state.motionPhase), [state.motionPhase]),
    config,
    navigation,
    isTouch,
    isReducedMotion: isInstantMode,
    isInteracting,
    motionDuration,
    visualPosition: isInstantMode ? null : visualPosition,
    isAtStart,
    isAtEnd,
  });

  const diagnosticContextValue = useMemo(
    () => ({
      notices,
      perfectPageLayout: {
        ...perfectPageLayoutInfo,
        visibleSlidesCount: layout.visibleSlidesCount,
      },
      slotAttachment: {
        isControlsOn,
        hasControlsSlot: renderPolicy.hasControlsSlot,
        isPaginationOn,
        hasPaginationSlot: renderPolicy.hasPaginationSlot,
      },
    }),
    [
      isControlsOn,
      isPaginationOn,
      layout.visibleSlidesCount,
      notices,
      perfectPageLayoutInfo,
      renderPolicy.hasControlsSlot,
      renderPolicy.hasPaginationSlot,
    ],
  );

  // --- style mapping --------------------------------------------------------
  const classNames = useMemo(
    () => (className ? mergeStyleMaps(styles, className) : styles),
    [className],
  );

  const slideClassMap = useMemo<SlideClassMap>(() => {
    const map = {} as SlideClassMap;
    SLIDE_CLASS_KEYS.forEach((key) => {
      map[key] = classNames[key] ?? "";
    });
    return map;
  }, [classNames]);

  const slideStyle = useMemo(
    () => slideFlexStyle(layout.visibleSlidesCount),
    [layout.visibleSlidesCount],
  );

  return (
    <CarouselModuleContext.Provider value={moduleContextValue}>
      <CarouselDiagnosticContext.Provider value={diagnosticContextValue}>
        <div
          className={classNames.outerContainer}
          role="region"
          aria-roledescription="carousel"
          data-carousel-root=""
          data-touch={isTouch}
          data-reduced-motion={isInstantMode}
        >
          <div
            ref={viewportRef}
            tabIndex={-1}
            className={classNames.innerContainer}
            data-carousel-viewport=""
            onMouseEnter={() => handleHoverChange(true)}
            onMouseLeave={() => handleHoverChange(false)}
            {...dragListeners}
          >
            <div
              ref={trackRef}
              className={classNames.slideContainer}
              data-carousel-track=""
            >
              {virtualSlides.map((slide) => (
                <SlideItem
                  key={slide.slideKey}
                  slideData={slide.slideData}
                  className={slideClassMap}
                  style={slideStyle}
                  isContentImg={isContentImg}
                  errAltPlaceholder={config.errorAltPlaceholder}
                  isInteractive={isInteractive}
                  isActive={slide.isActive}
                  isActual={slide.isActual}
                  onSlideClick={navigation.handleSlideClick}
                  {...slide.ariaProps}
                />
              ))}
            </div>
            {renderPolicy.shouldRenderControls ? slots.controls : null}
          </div>
          {renderPolicy.shouldRenderPagination ? slots.pagination : null}
          {slots.diagnostic}
        </div>
      </CarouselDiagnosticContext.Provider>
    </CarouselModuleContext.Provider>
  );
});

export default Carousel;
