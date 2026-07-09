import {
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import styles from "./Carousel.module.scss";
import { mergeStyleMaps, resolveSlots, useViewportVisibility } from "../../../shared";
import { CAROUSEL_DEFAULTS, useCarouselConfig } from "./config";
import {
  CarouselDiagnosticContext,
  CarouselMotionContext,
  CarouselStableContext,
  useModuleContextValue,
} from "./context";
import {
  carouselBoundaryState,
  slideFlexStyle,
  type CarouselSlideRecord,
} from "./domain";
import { useAutoplay } from "./autoplay/useAutoplay";
import { useFocusRecovery } from "./focus/useFocusRecovery";
import { useCarouselGesture } from "./gesture";
import { useResponsiveImageSizes, useTrackBinding } from "./geometry";
import {
  createMotionPlanChannel,
  useCarouselMotionExecution,
  type MotionPlanChannel,
} from "./motion";
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
import { SLIDE_CLASS_KEYS } from "./contract/types";
import type {
  CarouselProps,
  CarouselStatusSnapshot,
  SlideClassMap,
} from "./contract/types";

const EMPTY_IMAGE_URLS: readonly string[] = Object.freeze([]);

/** Every distinct image URL in the live deck — the set the store retains. */
const collectImageResourceUrls = (
  records: CarouselSlideRecord[],
  isContentImg: boolean,
): readonly string[] => {
  if (!isContentImg) return EMPTY_IMAGE_URLS;
  const urls = new Set<string>();
  for (const record of records) {
    const { content } = record.slideData;
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
    isPagePaddingOn,
  });

  // --- logical state machine ------------------------------------------------
  const { state, status, dispatch } = useCarouselState({
    layout,
    config,
    isInstantMode,
  });
  const lastStatusSnapshotRef = useRef<CarouselStatusSnapshot | null>(null);

  // --- boundary state -------------------------------------------------------
  // Lifted above the status-snapshot effect so the snapshot can carry the
  // same `isAtStart` / `isAtEnd` flags that `<Controls>` uses internally.
  // The motion / autoplay paths below consume the same memo.
  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex],
  );

  // --- image-resource SSOT --------------------------------------------------
  // The store exists only when the carousel renders image content; with
  // `isContentImg` off it is `null` and no image machinery runs. It is passed
  // explicitly to each `SlideItem` (no context) so the data flow stays visible
  // in source. Each slide subscribes to its own URL; the store is the single
  // authority on render status and retry.
  const imageResourceStore = useImageResourceStoreInstance(isContentImg);

  // --- DOM refs --------------------------------------------------------------
  // Declared here (before `imageSizes`) because the responsive-`sizes` hook
  // measures the live viewport to size its candidate hint.
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Carousel-owned default `sizes` for responsive slide images, measured from
  // the real (capped + padded) slot so the browser never up-picks a candidate
  // larger than the slot actually needs (see `useResponsiveImageSizes`).
  const imageSizes = useResponsiveImageSizes(
    viewportRef,
    layout.visibleSlidesCount,
  );

  // Keep the store's per-URL entries bounded to the live deck. Retained entries
  // are lightweight (render status + retry bookkeeping); a data replacement
  // drops any URL no longer present.
  const imageResourceUrls = useMemo(
    () => collectImageResourceUrls(records, isContentImg),
    [isContentImg, records],
  );

  useEffect(() => {
    imageResourceStore?.prune(imageResourceUrls);
  }, [imageResourceStore, imageResourceUrls]);

  // Read-only, low-frequency status reported to the host. Fires on mount and
  // whenever the idle flag, target page, or page count changes — never on a
  // per-frame motion sample. The target page (not the settled page) is
  // reported, so the snapshot reflects intent immediately on click/gesture.
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

  // --- motion execution: state -> controller, autoplay duration signal -----
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

  // --- visibility (for autoplay pause) -------------------------------------
  const visible = useViewportVisibility({
    elementRef: viewportRef,
    threshold: config.interaction.visibilityThreshold,
  });

  // --- autoplay -------------------------------------------------------------
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
      status,
      config,
      navigation,
      isTouch,
      isReducedMotion: isInstantMode,
      autoplayMotionDuration,
      visualPosition: isInstantMode ? null : visualPosition,
      motionPlan: isInstantMode ? null : planChannel.source,
      isAtStart,
      isAtEnd,
      isDiagnosticActive: renderPolicy.shouldRenderDiagnostic,
    });

  // --- diagnostic context ---------------------------------------------------
  // Carries raw props + observable layout/slot state. The carousel uses the
  // resolved runtime config regardless of this context — diagnostic data never
  // feeds back into runtime. The three sub-views are memoised independently so
  // a change in one (e.g. a slot toggle) leaves the others referentially
  // stable.
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

  // Full effective `state` is forwarded as-is. It carries its own `layout`
  // (CarouselState.layout), so the structural-invariant validator inside
  // `<Diagnostic />` cannot receive a state/layout pair from different
  // render turns. The other diagnostic sub-views (props/layout/slots) stay
  // independently memoised so unrelated changes do not invalidate them.
  const diagnosticContextValue = useMemo(
    () => ({
      state,
      props: diagnosticPropsView,
      layout: diagnosticLayoutView,
      slots: diagnosticSlotsView,
    }),
    [diagnosticLayoutView, diagnosticPropsView, diagnosticSlotsView, state],
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
