import { memo, useImperativeHandle, useMemo, useRef } from "react";

import styles from "./Carousel.module.scss";
import { mergeStyleMaps, resolveSlots } from "../../../shared";
import { CAROUSEL_DEFAULTS, useCarouselConfig } from "./config";
import {
  CarouselDiagnosticContext,
  CarouselMotionContext,
  CarouselStableContext,
  useDiagnosticContextValue,
  useModuleContextValue,
} from "./context";
import { carouselBoundaryState, slideFlexStyle } from "./domain";
import { useCarouselAutoplay } from "./autoplay/useCarouselAutoplay";
import { useFocusRecovery } from "./focus/useFocusRecovery";
import { useCarouselGesture } from "./gesture";
import { useResponsiveImageSizes, useTrackBinding } from "./geometry";
import {
  createMotionPlanChannel,
  useCarouselMotionExecution,
  type MotionPlanChannel,
} from "./motion";
import { useCarouselNavigation } from "./navigation";
import { useVisualPosition } from "./visual-position";
import { useModuleRenderPolicy } from "./render-policy/useModuleRenderPolicy";
import {
  SlideItem,
  useCarouselSlideDeck,
  useImageResourceStore,
  useSlideRenderModel,
} from "./slides";
import { CAROUSEL_SLOTS } from "./slots";
import { useCarouselState } from "./state";
import { useCarouselStatusReporter } from "./host-report/useCarouselStatusReporter";
import { SLIDE_CLASS_KEYS } from "./public-api/types";
import type { CarouselProps, SlideClassMap } from "./public-api/types";

const Carousel = memo(function Carousel(props: CarouselProps) {
  const {
    slidesData,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    jumpSpeedMultiplier,
    intervalAutoplay,
    errAltPlaceholder,
    isFullPagesOn = CAROUSEL_DEFAULTS.isFullPagesOn,
    isContentImg = CAROUSEL_DEFAULTS.isContentImg,
    isAuto = CAROUSEL_DEFAULTS.isAuto,
    isPaginationOn = CAROUSEL_DEFAULTS.isPaginationOn,
    isInteractive = CAROUSEL_DEFAULTS.isInteractive,
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
  // The carousel is a pure function of its props: it does not read matchMedia
  // / navigator itself. The host supplies the environment via `userEnvironment`
  // (see `useUserEnvironment` in `shared`). An unset signal resolves to `false`
  // — full motion, desktop behaviour, warm-up enabled — and the omission is
  // surfaced by the Diagnostic slot rather than silently repaired.
  const isInstantMode = userEnvironment?.reducedMotion ?? false;
  const isTouch = userEnvironment?.touch ?? false;
  const isDataSaverEnabled = userEnvironment?.dataSaver ?? false;

  // --- slots ----------------------------------------------------------------
  const slots = useMemo(() => resolveSlots(children, CAROUSEL_SLOTS), [children]);

  // --- resolved runtime config (no diagnostic dependency) ------------------
  const config = useCarouselConfig({
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    jumpSpeedMultiplier,
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

  // --- boundary state -------------------------------------------------------
  // Lifted above the status-snapshot effect so the snapshot can carry the
  // same `isAtStart` / `isAtEnd` flags that `<Controls>` uses internally.
  // The motion / autoplay paths below consume the same memo.
  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex],
  );

  // --- image-resource SSOT --------------------------------------------------
  // One call owns everything store-related: lifecycle (created only when the
  // carousel renders image content, `null` otherwise) and retention (entries
  // + retry timers pruned to the live deck). Passed explicitly to each
  // `SlideItem` (no context) so the data flow stays visible in source; each
  // slide subscribes to its own URL — the store is the single authority on
  // render status and retry.
  const imageResourceStore = useImageResourceStore({ isContentImg, records });

  // --- DOM refs --------------------------------------------------------------
  // Declared here (before `imageSizes`) because the responsive-`sizes` hook
  // measures the live viewport to size its candidate hint.
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Carousel-owned default `sizes` for responsive slide images, measured from
  // the real (capped + padded) slot so the browser never up-picks a candidate
  // larger than the slot actually needs (see `useResponsiveImageSizes`).
  const imageSizes = useResponsiveImageSizes({
    viewportRef,
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  // Read-only, low-frequency status reported to the host (deduplicated;
  // reflects intent immediately — see useCarouselStatusReporter).
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
  const { virtualSlides, renderWindowStart } = useSlideRenderModel({
    current: state.virtualIndex,
    previous: state.fromVirtualIndex,
    isMoving: status.isMoving,
    layout,
    records,
    renderWindowBufferMultiplier: config.layout.renderWindowBufferMultiplier,
  });

  // --- track DOM bridge -----------------------------------------------------
  const {
    readCurrentPosition,
    getSlotSize,
    startCompositorMotion,
    cancelCompositorMotion,
  } = useTrackBinding({
    trackRef,
    renderWindowStart,
    visibleSlidesCount: layout.visibleSlidesCount,
    visualPosition,
  });

  // --- motion plan channel ---------------------------------------------------
  // The engine computes every non-drag motion once (duration + percent
  // progress curve) and publishes it here; paint consumers (the pagination
  // widget) build their own WAAPI animation from the plan. A plain observable
  // — publishing never re-renders React.
  const planChannelRef = useRef<MotionPlanChannel | null>(null);
  if (planChannelRef.current === null) {
    planChannelRef.current = createMotionPlanChannel();
  }
  const planChannel = planChannelRef.current;

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

  // --- imperative handle ----------------------------------------------------
  // External prev/next control routes through the very same navigation
  // pipeline as the built-in <Controls> — no second control path.
  useImperativeHandle(
    ref,
    () => ({
      prev: navigation.handlePrev,
      next: navigation.handleNext,
    }),
    [navigation.handlePrev, navigation.handleNext],
  );

  // --- gesture --------------------------------------------------------------
  const { listeners: dragListeners, hostStyle: dragHostStyle } = useCarouselGesture({
    viewportRef,
    layout,
    isSwipeOn,
    dispatch,
    readCurrentPosition,
    applyTrackPosition: applyImmediatePosition,
    cancelTrackMotion: cancelCompositorMotion,
    getSlotSize,
    config,
  });

  // --- autoplay (visibility-aware) ------------------------------------------
  // One call owns the whole loop: viewport visibility, the pause rule, and
  // stable step handlers — see useCarouselAutoplay.
  const { handleHoverChange } = useCarouselAutoplay({
    state,
    config,
    navigation,
    isAuto,
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

  // --- module render policy & values ---------------------------------------
  const renderPolicy = useModuleRenderPolicy({
    controlsSlot: slots.controls,
    paginationSlot: slots.pagination,
    diagnosticSlot: slots.diagnostic,
    isControlsOn,
    isPaginationOn,
    canSlide: layout.canSlide,
  });

  const { stable: stableContextValue, motion: motionContextValue } =
    useModuleContextValue({
      state,
      navigation,
      isTouch,
      isReducedMotion: isInstantMode,
      visualPosition: isInstantMode ? null : visualPosition,
      motionPlan: isInstantMode ? null : planChannel.source,
      isAtStart,
      isAtEnd,
      isDiagnosticActive: renderPolicy.shouldRenderDiagnostic,
    });

  // --- diagnostic context ---------------------------------------------------
  // Raw props + observable layout/slot state, mirrored exactly as the runtime
  // sees them; never feeds back into runtime (see useDiagnosticContextValue).
  const diagnosticContextValue = useDiagnosticContextValue({
    state,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    jumpSpeedMultiplier,
    intervalAutoplay,
    errAltPlaceholder,
    userEnvironment,
    rawLength: perfectPageLayoutInfo.rawLength,
    extendedLength: perfectPageLayoutInfo.extendedLength,
    didExtendLayout: perfectPageLayoutInfo.didExtendLayout,
    hasPerfectPageLayout: perfectPageLayoutInfo.hasPerfectPageLayout,
    visibleSlidesCount: layout.visibleSlidesCount,
    canSlide: layout.canSlide,
    isControlsOn,
    hasControlsSlot: renderPolicy.hasControlsSlot,
    isPaginationOn,
    hasPaginationSlot: renderPolicy.hasPaginationSlot,
  });

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
    <CarouselStableContext.Provider value={stableContextValue}>
      <CarouselMotionContext.Provider value={motionContextValue}>
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
              style={dragHostStyle}
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
                    isDataSaverEnabled={isDataSaverEnabled}
                    imageResourceStore={imageResourceStore}
                    imageSizes={imageSizes}
                    onSlideClick={navigation.handleSlideClick}
                    {...slide.ariaProps}
                  />
                ))}
              </div>
              {renderPolicy.shouldRenderControls ? slots.controls : null}
            </div>
            {renderPolicy.shouldRenderPagination ? slots.pagination : null}
            {renderPolicy.shouldRenderDiagnostic ? slots.diagnostic : null}
          </div>
        </CarouselDiagnosticContext.Provider>
      </CarouselMotionContext.Provider>
    </CarouselStableContext.Provider>
  );
});

export default Carousel;
