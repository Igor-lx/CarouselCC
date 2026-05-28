import { useCallback, useMemo } from "react";

import type { CarouselDispatch, MoveReason } from "../state";
import type { Slide } from "../contract/types";

interface UseCarouselNavigationInput {
  enabled: boolean;
  dispatch: CarouselDispatch;
  readCurrentPosition: () => number;
  onSlideClick?: (slide: Slide) => void;
}

export interface CarouselNavigation {
  move: (step: number, reason: MoveReason) => void;
  goTo: (pageIndex: number, reason: MoveReason) => void;
  handlePrev: () => void;
  handleNext: () => void;
  handlePageSelect: (pageIndex: number) => void;
  handleSlideClick: (slide: Slide) => void;
}

export function useCarouselNavigation({
  enabled,
  dispatch,
  readCurrentPosition,
  onSlideClick,
}: UseCarouselNavigationInput): CarouselNavigation {
  const move = useCallback(
    (step: number, reason: MoveReason) => {
      if (!enabled) return;
      const fromVirtualIndex = readCurrentPosition();
      dispatch({
        type: "MOVE",
        step,
        moveReason: reason,
        fromVirtualIndex,
      });
    },
    [dispatch, enabled, readCurrentPosition],
  );

  const goTo = useCallback(
    (pageIndex: number, reason: MoveReason) => {
      if (!enabled) return;
      const fromVirtualIndex = readCurrentPosition();
      dispatch({
        type: "GO_TO",
        targetPageIndex: pageIndex,
        moveReason: reason,
        fromVirtualIndex,
      });
    },
    [dispatch, enabled, readCurrentPosition],
  );

  const handlePrev = useCallback(() => {
    move(-1, "click");
  }, [move]);

  const handleNext = useCallback(() => {
    move(1, "click");
  }, [move]);

  const handlePageSelect = useCallback(
    (pageIndex: number) => goTo(pageIndex, "click"),
    [goTo],
  );

  const handleSlideClick = useCallback(
    (slide: Slide) => onSlideClick?.(slide),
    [onSlideClick],
  );

  return useMemo(
    () => ({
      move,
      goTo,
      handlePrev,
      handleNext,
      handlePageSelect,
      handleSlideClick,
    }),
    [goTo, handleNext, handlePageSelect, handlePrev, handleSlideClick, move],
  );
}
