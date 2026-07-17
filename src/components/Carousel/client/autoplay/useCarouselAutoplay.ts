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
  /** Master autoplay switch (the `isAuto` public prop). */
  isAuto: boolean;
  /** Touch environments keep autoplay running under hover. */
  isTouch: boolean;
  /** Finite-mode end boundary — the next tick loops back to page 0. */
  isAtEnd: boolean;
  /** The carousel viewport: autoplay pauses while it is mostly off-screen. */
  viewportRef: RefObject<HTMLDivElement | null>;
}

/**
 * The carousel-specific autoplay adapter over the `useAutoplay` timer loop —
 * the same SHAPE as `useCarouselGesture` over `usePointerSwipe`, but a
 * different TIER: the pointer-swipe primitive is a reusable engine in
 * `shared`, while both autoplay halves live inside the component on purpose
 * (an internal redistribution for clarity; nothing outside the carousel needs
 * an autoplay loop). Owns everything the loop needs:
 * - viewport visibility (IntersectionObserver + tab visibility) — consumed by
 *   autoplay alone, so the subscription lives here, not in the root;
 * - the pause rule (off-screen, dragging, already moving, or the glass /
 *   viewport unsettled — see useViewportBusy: an autoplay tick fired into the
 *   browser-chrome settle window lands on a display compositor that is busy
 *   aggregating two live surfaces, and on weak GPUs the ride's first frames
 *   miss the presentation latch and visibly bounce);
 * - referentially stable step handlers (they sit in the deps of the interval
 *   effect — a fresh identity per render would restart the timer, measuring
 *   the interval from the last render instead of the last tick).
 */
export function useCarouselAutoplay({
  state,
  config,
  navigation,
  isAuto,
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

  // A finger anywhere on the glass (not just on the carousel), an ongoing
  // scroll/fling, or the browser chrome settling: no NEW rides until quiet.
  // A GETTER, checked when a tick fires — never a render trigger.
  const getIsViewportBusy = useViewportBusy({
    enabled: isAuto && state.layout.canSlide,
    quietDelayMs: config.interaction.autoplayResettleDelayMs,
  });

  return useAutoplay({
    enabled: isAuto && state.layout.canSlide,
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
