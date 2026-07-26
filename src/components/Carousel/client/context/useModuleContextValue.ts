// See docs/architecture/context.md
import { useMemo, type RefObject } from "react";

import type { MotionPlanSource } from "../motion";
import type { CarouselNavigation } from "../navigation";
import type { VisualPositionSource } from "../visual-position";
import { motionStatus } from "../state";
import type { CarouselState } from "../state";
import type {
  CarouselIntentView,
  CarouselLayoutView,
  CarouselMotionContextValue,
  CarouselSlideMediaView,
  CarouselStableContextValue,
  CarouselStatusView,
} from "./types";

interface UseModuleContextValueInput {
  state: CarouselState;
  navigation: CarouselNavigation;
  isTouch: boolean;
  isReducedMotion: boolean;
  isDataSaverEnabled: boolean;
  slides: readonly CarouselSlideMediaView[];
  trackRef: RefObject<HTMLDivElement | null>;
  isOffBandFetchOn: boolean;
  visualPosition: VisualPositionSource | null;
  motionPlan: MotionPlanSource | null;
  isAtStart: boolean;
  isAtEnd: boolean;
  isDiagnosticActive: boolean;
  isPaginationInteractiveOn: boolean;
}

export function useModuleContextValue({
  state,
  navigation,
  isTouch,
  isReducedMotion,
  isDataSaverEnabled,
  slides,
  trackRef,
  isOffBandFetchOn,
  visualPosition,
  motionPlan,
  isAtStart,
  isAtEnd,
  isDiagnosticActive,
  isPaginationInteractiveOn,
}: UseModuleContextValueInput): {
  stable: CarouselStableContextValue;
  motion: CarouselMotionContextValue;
} {
  const statusView = useMemo<CarouselStatusView>(() => {
    const status = motionStatus(state.motionPhase);
    return {
      motionPhase: state.motionPhase,
      isIdle: status.isIdle,
      isMoving: status.isMoving,
      isJumping: status.isJumping,
      isDragging: status.isDragging,
    };
  }, [state.motionPhase]);

  const layoutView = useMemo<CarouselLayoutView>(
    () => ({
      pageCount: state.layout.pageCount,
      visibleSlidesCount: state.layout.visibleSlidesCount,
      isFinite: state.layout.isFinite,
      canSlide: state.layout.canSlide,
      isAtStart,
      isAtEnd,
      isTouch,
      isReducedMotion,
      isDataSaverEnabled,
      isDiagnosticActive,
    }),
    [
      isAtEnd,
      isAtStart,
      isDataSaverEnabled,
      isDiagnosticActive,
      isReducedMotion,
      isTouch,
      state.layout.canSlide,
      state.layout.isFinite,
      state.layout.pageCount,
      state.layout.visibleSlidesCount,
    ],
  );

  const intentView = useMemo<CarouselIntentView>(
    () => ({ targetPageIndex: state.targetPageIndex }),
    [state.targetPageIndex],
  );

  const navigationView = useMemo(
    () => ({
      handlePrev: navigation.handlePrev,
      handleNext: navigation.handleNext,
      handlePageSelect: navigation.handlePageSelect,
    }),
    [navigation.handleNext, navigation.handlePageSelect, navigation.handlePrev],
  );

  const stable = useMemo<CarouselStableContextValue>(
    () => ({
      layout: layoutView,
      navigation: navigationView,
      visualPosition,
      motionPlan,
      slides,
      trackRef,
      isOffBandFetchOn,
      isPaginationInteractiveOn,
    }),
    [
      isOffBandFetchOn,
      isPaginationInteractiveOn,
      layoutView,
      motionPlan,
      navigationView,
      slides,
      trackRef,
      visualPosition,
    ],
  );

  const motion = useMemo<CarouselMotionContextValue>(
    () => ({
      status: statusView,
      intent: intentView,
    }),
    [intentView, statusView],
  );

  return useMemo(() => ({ stable, motion }), [motion, stable]);
}
