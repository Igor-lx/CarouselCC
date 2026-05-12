import { useMemo } from "react";

import type { CarouselRuntimeConfig } from "../config";
import type { CarouselNavigation } from "../navigation";
import type { VisualPositionSource } from "../position";
import type { motionStatus } from "../state";
import type { CarouselState } from "../state";
import type {
  CarouselIntentView,
  CarouselLayoutView,
  CarouselModuleContextValue,
  CarouselStatusView,
} from "./types";

interface UseModuleContextValueInput {
  state: CarouselState;
  status: ReturnType<typeof motionStatus>;
  config: CarouselRuntimeConfig;
  navigation: CarouselNavigation;
  isTouch: boolean;
  isReducedMotion: boolean;
  isInteracting: boolean;
  motionDuration: number;
  visualPosition: VisualPositionSource | null;
  isAtStart: boolean;
  isAtEnd: boolean;
}

export function useModuleContextValue({
  state,
  status,
  config,
  navigation,
  isTouch,
  isReducedMotion,
  isInteracting,
  motionDuration,
  visualPosition,
  isAtStart,
  isAtEnd,
}: UseModuleContextValueInput): CarouselModuleContextValue {
  const statusView = useMemo<CarouselStatusView>(
    () => ({
      motionPhase: state.motionPhase,
      isIdle: status.isIdle,
      isMoving: status.isMoving,
      isJumping: status.isJumping,
      isDragging: status.isDragging,
      isInteracting,
    }),
    [
      isInteracting,
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
    }),
    [
      isAtEnd,
      isAtStart,
      isReducedMotion,
      isTouch,
      state.layout.canSlide,
      state.layout.pageCount,
    ],
  );

  const intentView = useMemo<CarouselIntentView>(
    () => ({
      activePageIndex: state.targetPageIndex,
      targetPageIndex: state.targetPageIndex,
      moveReason: state.moveReason,
      motionDuration,
      autoplayPaginationFactor: config.interaction.autoplayPaginationFactor,
    }),
    [
      config.interaction.autoplayPaginationFactor,
      motionDuration,
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

  return useMemo<CarouselModuleContextValue>(
    () => ({
      status: statusView,
      layout: layoutView,
      intent: intentView,
      navigation: navigationView,
      visualPosition,
    }),
    [intentView, layoutView, navigationView, statusView, visualPosition],
  );
}
