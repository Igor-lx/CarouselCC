import { memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import styles from "./Carousel.module.scss";
import {
  mergeStyleMaps,
  resolveSlots,
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
import { useCarouselMotionExecution } from "./motion";
import { useCarouselNavigation } from "./navigation";
import { useVisualPosition } from "./position";
import { useModuleRenderPolicy } from "./render-policy/useModuleRenderPolicy";
import {
  SlideItem,
  useCarouselSlideDeck,
  useImageResourceStoreInstance,
  useSlideRenderModel,
} from "./slides";
import { CAROUSEL_SLOTS } from "./slots";
import { useCarouselState } from "./state";
import { areStatusSnapshotsEqual } from "./status/statusSnapshot";
import { SLIDE_CLASS_KEYS } from "./contract/classKeys";
import type {
  CarouselProps,
  CarouselStatusSnapshot,
  SlideClassMap,
} from "./contract/types";
import type { CarouselSlideRecord } from "./domain";

const EMPTY_IMAGE_URLS: readonly string[] = Object.freeze([]);

const collectImageResourceUrls = (
  records: readonly CarouselSlideRecord[],
  isContentImg: boolean,
): readonly string[] => {
  if (!isContentImg) return EMPTY_IMAGE_URLS;

  const urls = new Set<string>();
  for (const record of records) {
    const content = record.slideData.content;
    if (typeof content === "string") urls.add(content);
  }
  return [...urls];
};

const Carousel = memo(function Carousel(props: CarouselProps) {
  const {
    slidesData,
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    jumpSpeedMultiplier,
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
    userEnvironment,
    onSlideClick,
    onCarouselStatusChange,
    children,
    ref,
  } = props;

  const isInstantMode = userEnvironment?.reducedMotion ?? false;
  const isTouch = userEnvironment?.touch ?? false;
  const isDataSaverEnabled = userEnvironment?.dataSaver ?? false;

  const slots = useMemo(() => resolveSlots(children, CAROUSEL_SLOTS), [children]);

  const config = useCarouselConfig({
    visibleSlidesNr,
    durationAutoplay,
    durationStep,
    jumpSpeedMultiplier,
    intervalAutoplay,
    errAltPlaceholder,
  });

  const { records, layout, perfectPageLayoutInfo } = useCarouselSlideDeck({
    slidesData,
    visibleSlidesCount: config.visibleSlidesCount,
    isFinite: isFiniteProp,
    isPagePaddingOn,
  });

  const { state, status, dispatch } = useCarouselState({
    layout,
    config,
    isInstantMode,
  });
  const lastStatusSnapshotRef = useRef<CarouselStatusSnapshot | null>(null);

  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex],
  );

  const imageResourceStore = useImageResourceStoreInstance(isContentImg);

  const imageResourceUrls = useMemo(
    () => collectImageResourceUrls(records, isContentImg),
    [isContentImg, records],
  );

  useEffect(() => {
    imageResourceStore?.prune(imageResourceUrls);
  }, [imageResourceStore, imageResourceUrls]);

  useEffect(() => {
    if (!onCarouselStatusChange) return;
    const snapshot: CarouselStatusSnapshot = {
      isIdle: status.isIdle,
      currentPageIndex: state.targetPageIndex,
      pageCount: layout.pageCount,
      isAtStart,
      isAtEnd,
    };
    const previous = lastStatusSnapshotRef.current;
    if (previous && areStatusSnapshotsEqual(previous, snapshot)) return;
    lastStatusSnapshotRef.current = snapshot;
    onCarouselStatusChange(snapshot);
  }, [
    onCarouselStatusChange,
    status.isIdle,
    state.targetPageIndex,
    layout.pageCount,
    isAtStart,
    isAtEnd,
  ]);

  const {
    source: visualPosition,
    controller,
    applyImmediatePosition,
  } = useVisualPosition({
    visibleSlidesCount: layout.visibleSlidesCount,
  });

  const { virtualSlides, renderWindowStart } = useSlideRenderModel({
    current: state.virtualIndex,
    previous: state.fromVirtualIndex,
    isMoving: status.isMoving,
    layout,
    records,
    renderWindowBufferMultiplier: config.layout.renderWindowBufferMultiplier,
  });

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

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

  const { autoplayMotionDuration } = useCarouselMotionExecution({
    state,
    config,
    controller,
    dispatch,
    isInstantMode,
    isDragging: status.isDragging,
    enabled: layout.canSlide,
    startCompositorMotion,
    cancelCompositorMotion,
  });

  const navigation = useCarouselNavigation({
    enabled: layout.canSlide,
    dispatch,
    readCurrentPosition,
    onSlideClick,
  });

  useImperativeHandle(
    ref,
    () => ({
      prev: navigation.handlePrev,
      next: navigation.handleNext,
    }),
    [navigation.handlePrev, navigation.handleNext],
  );

  const { listeners: dragListeners } = useCarouselGesture({
    enabled: layout.canSlide,
    viewportRef,
    layout,
    dispatch,
    readCurrentPosition,
    applyTrackPosition: applyImmediatePosition,
    cancelTrackMotion: cancelCompositorMotion,
    getSlotSize,
    config,
  });

  const visible = useViewportVisibility({
    elementRef: viewportRef,
    threshold: config.interaction.visibilityThreshold,
  });

  const autoplayPaused = !visible || status.isDragging || status.isMoving;
  const { handleHoverChange } = useAutoplay({
    enabled: isAuto && layout.canSlide,
    isPaused: autoplayPaused,
    isAtEnd,
    intervalMs: config.autoplayInterval,
    hoverPauseDelayMs: config.interaction.hoverPauseDelay,
    ignoreHover: isTouch,
    onStep: () => navigation.move(1, "autoplay"),
    onGoToStart: () => navigation.goTo(0, "autoplay"),
  });

  useFocusRecovery({
    containerRef: viewportRef,
    isIdle: status.isIdle,
    targetPageIndex: state.targetPageIndex,
  });

  const renderPolicy = useModuleRenderPolicy({
    controlsSlot: slots.controls,
    paginationSlot: slots.pagination,
    diagnosticSlot: slots.diagnostic,
    isControlsOn,
    isPaginationOn,
    canSlide: layout.canSlide,
  });

  const moduleContextValue = useModuleContextValue({
    state,
    status,
    config,
    navigation,
    isTouch,
    isReducedMotion: isInstantMode,
    autoplayMotionDuration,
    visualPosition: isInstantMode ? null : visualPosition,
    isAtStart,
    isAtEnd,
    isDiagnosticActive: renderPolicy.shouldRenderDiagnostic,
  });

  const diagnosticPropsView = useMemo(
    () => ({
      visibleSlidesNr,
      durationAutoplay,
      durationStep,
      jumpSpeedMultiplier,
      intervalAutoplay,
      errAltPlaceholder,
      userEnvironment,
    }),
    [
      durationAutoplay,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      jumpSpeedMultiplier,
      userEnvironment,
      visibleSlidesNr,
    ],
  );

  const diagnosticLayoutView = useMemo(
    () => ({
      rawLength: perfectPageLayoutInfo.rawLength,
      extendedLength: perfectPageLayoutInfo.extendedLength,
      didExtendLayout: perfectPageLayoutInfo.didExtendLayout,
      hasPerfectPageLayout: perfectPageLayoutInfo.hasPerfectPageLayout,
      visibleSlidesCount: layout.visibleSlidesCount,
      canSlide: layout.canSlide,
    }),
    [
      layout.canSlide,
      layout.visibleSlidesCount,
      perfectPageLayoutInfo.didExtendLayout,
      perfectPageLayoutInfo.extendedLength,
      perfectPageLayoutInfo.hasPerfectPageLayout,
      perfectPageLayoutInfo.rawLength,
    ],
  );

  const diagnosticSlotsView = useMemo(
    () => ({
      isControlsOn,
      hasControlsSlot: renderPolicy.hasControlsSlot,
      isPaginationOn,
      hasPaginationSlot: renderPolicy.hasPaginationSlot,
    }),
    [
      isControlsOn,
      isPaginationOn,
      renderPolicy.hasControlsSlot,
      renderPolicy.hasPaginationSlot,
    ],
  );

  const diagnosticContextValue = useMemo(
    () => ({
      state,
      props: diagnosticPropsView,
      layout: diagnosticLayoutView,
      slots: diagnosticSlotsView,
    }),
    [diagnosticLayoutView, diagnosticPropsView, diagnosticSlotsView, state],
  );

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
              data-carousel-track-active={
                status.isMoving || status.isDragging ? true : undefined
              }
            >
              {virtualSlides.map((slide) => (
                <SlideItem
                  key={slide.slideKey}
                  slideData={slide.slideData}
                  className={slideClassMap}
                  style={slideStyle}
                  isContentImg={isContentImg}
                  imageResourceStore={imageResourceStore}
                  isDataSaverEnabled={isDataSaverEnabled}
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
          {renderPolicy.shouldRenderDiagnostic ? slots.diagnostic : null}
        </div>
      </CarouselDiagnosticContext.Provider>
    </CarouselModuleContext.Provider>
  );
});

export default Carousel;
