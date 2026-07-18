import { useMemo } from "react";

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
  imageSizes: string;
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
  imageSizes,
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
  // Derived here from the single source (state.motionPhase) rather than
  // taking a parallel pre-derived object — one input, no chance of the pair
  // drifting apart.
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

  // Two values partitioned by update cadence (see context `types.ts`). The
  // stable half re-identifies only when navigation / layout / visualPosition
  // change (rare); the motion half re-identifies on every click/gesture/settle.
  // Keeping them separate means stable-only consumers (e.g. <Controls>) do not
  // re-render on routine steps.
  const stable = useMemo<CarouselStableContextValue>(
    () => ({
      layout: layoutView,
      navigation: navigationView,
      visualPosition,
      motionPlan,
      slides,
      imageSizes,
      isPaginationInteractiveOn,
    }),
    [
      imageSizes,
      isPaginationInteractiveOn,
      layoutView,
      motionPlan,
      navigationView,
      slides,
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
