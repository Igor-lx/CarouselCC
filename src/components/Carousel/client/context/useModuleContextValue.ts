import { useMemo } from "react";

import type { CarouselRuntimeConfig } from "../config";
import type { CarouselNavigation } from "../navigation";
import type { VisualPositionSource } from "../position";
import type { motionStatus } from "../state";
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
  status: ReturnType<typeof motionStatus>;
  config: CarouselRuntimeConfig;
  navigation: CarouselNavigation;
  isTouch: boolean;
  isReducedMotion: boolean;
  autoplayMotionDuration: number;
  visualPosition: VisualPositionSource | null;
  isAtStart: boolean;
  isAtEnd: boolean;
  isDiagnosticActive: boolean;
}

export function useModuleContextValue({
  state,
  status,
  config,
  navigation,
  isTouch,
  isReducedMotion,
  autoplayMotionDuration,
  visualPosition,
  isAtStart,
  isAtEnd,
  isDiagnosticActive,
}: UseModuleContextValueInput): {
  stable: CarouselStableContextValue;
  motion: CarouselMotionContextValue;
} {
  const statusView = useMemo<CarouselStatusView>(
    () => ({
      motionPhase: state.motionPhase,
      isIdle: status.isIdle,
      isMoving: status.isMoving,
      isJumping: status.isJumping,
      isDragging: status.isDragging,
    }),
    [
      state.motionPhase,
      status.isDragging,
      status.isIdle,
      status.isJumping,
      status.isMoving,
    ],
  );

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
    () => ({
      targetPageIndex: state.targetPageIndex,
      moveReason: state.moveReason,
      autoplayMotionDuration,
      autoplayPaginationFactor: config.interaction.autoplayPaginationFactor,
    }),
    [
      autoplayMotionDuration,
      config.interaction.autoplayPaginationFactor,
      state.moveReason,
      state.targetPageIndex,
    ],
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
    }),
    [layoutView, navigationView, visualPosition],
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
