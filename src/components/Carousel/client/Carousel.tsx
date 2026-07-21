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
} from "./context";
import { carouselBoundaryState, deckCarriesImageSets } from "./domain";
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
import { areCarouselPropsEqual } from "./areCarouselPropsEqual";
import { useModuleRenderPolicy } from "./render-policy/useModuleRenderPolicy";
import { useCarouselPresentation } from "./presentation";
import { useSlideViewport } from "./viewport/useSlideViewport";
import {
  SlideItem,
  useActiveBandGate,
  useCarouselSlideDeck,
  useImageResourceStore,
  useSlideRenderModel,
} from "./slides";
import { CAROUSEL_SLOTS } from "./slots";
import { useCarouselState } from "./state";
import { useCarouselStatusReporter } from "./host-report/useCarouselStatusReporter";
import type { CarouselProps } from "./public-api/types";

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
  // The carousel is a pure function of its props: it does not read matchMedia
  // / navigator itself. The host supplies the environment via `userEnvironment`
  // (see `useUserEnvironment` in `shared`). An unset signal resolves to `false`
  // — full motion, desktop behaviour, warm-up enabled — and the omission is
  // surfaced by the Diagnostic slot rather than silently repaired.
  const isInstantMode = userEnvironment?.reducedMotion ?? false;
  const isTouch = userEnvironment?.touch ?? false;
  const isDataSaverEnabled = userEnvironment?.dataSaver ?? false;

  // --- slots ----------------------------------------------------------------
  const slots = useMemo(
    () => resolveSlots(children, CAROUSEL_SLOTS),
    [children]
  );

  // The responsive-image stack (art-directed sources, srcSet/sizes, rotation
  // veil, aspect flip) is switched by the PRESENCE of the <ResponsiveImages>
  // slot: no module — one native set everywhere, largest candidate, zero
  // responsive machinery (see resolveRenderedImageSrc).
  const isResponsiveImagesOn = Boolean(slots["responsive-images"]);

  // Live viewport axes (breakpoint tier / orientation / flags) — stamped on
  // the root below; the SCSS slide geometry keys on them.
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

  // --- boundary state -------------------------------------------------------
  // Lifted above the status-snapshot effect so the snapshot can carry the
  // same `isAtStart` / `isAtEnd` flags that `<Controls>` uses internally.
  // The motion / autoplay paths below consume the same memo.
  const { isAtStart, isAtEnd } = useMemo(
    () => carouselBoundaryState(state.targetPageIndex, layout),
    [layout, state.targetPageIndex]
  );

  // --- image-resource SSOT --------------------------------------------------
  // One call owns everything store-related: lifecycle (created only when the
  // carousel renders image content, `null` otherwise) and retention (entries
  // + retry timers pruned to the live deck). Passed explicitly to each
  // `SlideItem` (no context) so the data flow stays visible in source; each
  // slide subscribes to its own URL — the store is the single authority on
  // render status and retry.
  // Deck-order media descriptors for media modules (ResponsiveImages):
  // low-frequency (changes with the data only), image slides only.
  const slideMediaViews = useMemo(
    () =>
      isContentImg
        ? records.flatMap((record) => {
            const { content, image } = record.slideData;
            if (typeof content !== "string") return [];
            return [
              {
                src: content,
                srcSet: image?.srcSet,
                sizes: image?.sizes,
                sources: image?.sources,
              },
            ];
          })
        : [],
    [isContentImg, records]
  );

  const useMemoDeckCarriesImageSets = useMemo(
    () => deckCarriesImageSets(records),
    [records]
  );

  const imageResourceStore = useImageResourceStore({
    isContentImg,
    records,
    isResponsiveImagesOn,
  });

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
  const { virtualSlides, layoutOrigin } = useSlideRenderModel({
    current: state.virtualIndex,
    previous: state.fromVirtualIndex,
    // Any non-idle phase, INCLUDING dragging. A catch-and-hold brakes the
    // strip at a fractional position and the reducer sits in "dragging"; with
    // the flag false the active band collapsed to [current, current+visible)
    // — which a fractional current tilts PAST the leftmost on-screen slide.
    // That slide went inert under the user's finger: hit-testing died, so the
    // browser's long-press menu gave its haptic and then refused to open
    // (always the LEFT slide, in both scroll directions — measured on device).
    isMoving: !status.isIdle,
    layout,
    records,
    renderWindowBufferMultiplier: config.layout.renderWindowBufferMultiplier,
  });

  // Bandwidth gate: the buffered slides of the render window hold their image
  // sources until the visible band has reported back, so the slide the user is
  // looking at does not share the pipe with four it has not asked for yet
  // (see `useActiveBandGate`).
  const isOffBandFetchOn = useActiveBandGate({
    virtualSlides,
    isContentImg,
    isResponsiveImagesOn,
    imageResourceStore,
  });

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
    [navigation.handlePrev, navigation.handleNext]
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
    config,
  });

  // --- autoplay (visibility-aware) ------------------------------------------
  // One call owns the whole loop: viewport visibility, the pause rule, and
  // stable step handlers — see useCarouselAutoplay.
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

  // --- module render policy & values ---------------------------------------
  // The policy owns the whole decision: `moduleSlots` are the slot children
  // ALREADY gated (a silenced module is `null`), so the view below just renders
  // them — no per-slot conditionals duplicated in JSX.
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
  // Raw props + observable layout/slot state, mirrored exactly as the runtime
  // sees them; never feeds back into runtime (see useDiagnosticContextValue).
  const diagnosticContextValue = useDiagnosticContextValue({
    state,
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
    visibleSlidesCount: layout.visibleSlidesCount,
    canSlide: layout.canSlide,
    isControlsOn,
    hasControlsSlot: renderPolicy.hasControlsSlot,
    isPaginationOn,
    hasPaginationSlot: renderPolicy.hasPaginationSlot,
    isPaginationInteractiveOn,
    hasResponsiveImagesSlot: renderPolicy.hasResponsiveImagesSlot,
    deckCarriesImageSets: useMemoDeckCarriesImageSets,
  });

  // --- presentation payload (classes, CSS vars, state attributes) ----------
  const {
    classNames,
    slideClassMap,
    rootStyle,
    slideStyles,
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
            // The viewport axes (config/viewport.ts), stamped as the styling
            // contract: the component SCSS shapes slide geometry by these
            // attributes and carries no media queries of its own. Each active
            // flag adds a `data-<flag>` attribute (see presentation/domPayload).
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
              // ref + listeners + engine styles, one bundle: the engine owns
              // the host and forwards the node into viewportRef.
              {...dragHostProps}
            >
              <div
                ref={trackRef}
                className={classNames.slideContainer}
                data-carousel-track=""
              >
                <div aria-hidden="true" className={styles.slideSizer} />
                {virtualSlides.map((slide, index) => (
                  <SlideItem
                    key={slide.slideKey}
                    slideData={slide.slideData}
                    className={slideClassMap}
                    style={slideStyles[index]}
                    isContentImg={isContentImg}
                    isResponsiveImagesOn={isResponsiveImagesOn}
                    errAltPlaceholder={config.errorAltPlaceholder}
                    isInteractiveOn={isSlideInteractiveOn}
                    isActive={slide.isActive}
                    isActual={slide.isActual}
                    isOffBandFetchOn={isOffBandFetchOn}
                    isDataSaverEnabled={isDataSaverEnabled}
                    imageResourceStore={imageResourceStore}
                    imageSizes={imageSizes}
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
