// See docs/architecture/autoplay.md
import { useCallback, type RefObject } from "react";

import { useViewportBusy, useViewportVisibility } from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { CarouselNavigation } from "../navigation";
import { motionStatus, type CarouselState } from "../state";
import { useAutoplay, type AutoplayApi } from "./useAutoplay";

interface UseCarouselAutoplayInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  navigation: CarouselNavigation;
  isAutoplayOn: boolean;
  isTouch: boolean;
  isAtEnd: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useCarouselAutoplay({
  state,
  config,
  navigation,
  isAutoplayOn,
  isTouch,
  isAtEnd,
  viewportRef,
}: UseCarouselAutoplayInput): AutoplayApi {
  const visible = useViewportVisibility({
    elementRef: viewportRef,
    threshold: config.interaction.visibilityThreshold,
  });

  const handleStep = useCallback(
    () => navigation.move(1, "autoplay"),
    [navigation],
  );
  const handleLoopToStart = useCallback(
    () => navigation.goTo(0, "autoplay"),
    [navigation],
  );

  const { isDragging, isMoving } = motionStatus(state.motionPhase);

  const getIsViewportBusy = useViewportBusy({
    enabled: isAutoplayOn && state.layout.canSlide,
    quietDelayMs: config.interaction.autoplayResettleDelayMs,
  });

  return useAutoplay({
    enabled: isAutoplayOn && state.layout.canSlide,
    isPaused: !visible || isDragging || isMoving,
    shouldDeferTick: getIsViewportBusy,
    isAtEnd,
    intervalMs: config.autoplayInterval,
    hoverPauseDelayMs: config.interaction.hoverPauseDelay,
    ignoreHover: isTouch,
    onStep: handleStep,
    onGoToStart: handleLoopToStart,
  });
}
