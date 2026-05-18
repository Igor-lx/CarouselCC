import { useCallback, useMemo } from "react";

import type { CarouselCommands } from "../commands";
import type { MoveReason } from "../state";
import type { Slide } from "../types";

interface UseCarouselNavigationInput {
  enabled: boolean;
  commands: Pick<CarouselCommands, "move" | "goTo">;
  onSlideClick?: (slide: Slide) => void;
}

export interface CarouselNavigation {
  move: (step: number, reason?: MoveReason) => void;
  goTo: (pageIndex: number, reason?: MoveReason) => void;
  handlePrev: () => void;
  handleNext: () => void;
  handlePageSelect: (pageIndex: number) => void;
  handleSlideClick: (slide: Slide) => void;
}

export function useCarouselNavigation({
  enabled,
  commands,
  onSlideClick,
}: UseCarouselNavigationInput): CarouselNavigation {
  const handlePrev = useCallback(() => {
    if (!enabled) return;
    commands.move(-1, "click");
  }, [commands, enabled]);
  const handleNext = useCallback(() => {
    if (!enabled) return;
    commands.move(1, "click");
  }, [commands, enabled]);
  const handlePageSelect = useCallback(
    (pageIndex: number) => {
      if (!enabled) return;
      commands.goTo(pageIndex, "click");
    },
    [commands, enabled],
  );
  const handleSlideClick = useCallback(
    (slide: Slide) => onSlideClick?.(slide),
    [onSlideClick],
  );

  return useMemo(
    () => ({
      move: commands.move,
      goTo: commands.goTo,
      handlePrev,
      handleNext,
      handlePageSelect,
      handleSlideClick,
    }),
    [
      commands.goTo,
      commands.move,
      handleNext,
      handlePageSelect,
      handlePrev,
      handleSlideClick,
    ],
  );
}
