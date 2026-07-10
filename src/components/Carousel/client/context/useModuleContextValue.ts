import { useMemo } from "react";

import type { MotionPlanSource } from "../motion";
import type { CarouselNavigation } from "../navigation";
import type { VisualPositionSource } from "../position";
import { motionStatus } from "../state";
import type { CarouselState } from "../state";
import type {
  CarouselIntentView,
  CarouselLayoutView,
  CarouselMotionContextValue,
  CarouselStableContextValue,
  CarouselStatusView,
} from "./types";

interface UseModuleContextValueInput {
  state: CarouselState;
  navigation: CarouselNavigation;
  isTouch: boolean;
  isReducedMotion: boolean;
  visualPosition: VisualPositionSource | null;
  motionPlan: MotionPlanSource | null;
  isAtStart: boolean;
  isAtEnd: boolean;
  isDiagnosticActive: boolean;
}

export function useModuleContextValue({
  state,
  navigation,
  isTouch,
  isReducedMotion,
  visualPosition,
  motionPlan,
  isAtStart,
  isAtEnd,
  isDiagnosticActive,
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
      canSlide: state.layout.canSlide,
      isAtStart,
      isAtEnd,
      isTouch,
      isReducedMotion,
      isDiagnosticActive,
    }),
    [
      isAtEnd,
      isAtStart,
      isDiagnosticActive,
      isReducedMotion,
      isTouch,
      state.layout.canSlide,
      state.layout.pageCount,
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
    }),
    [layoutView, motionPlan, navigationView, visualPosition],
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
