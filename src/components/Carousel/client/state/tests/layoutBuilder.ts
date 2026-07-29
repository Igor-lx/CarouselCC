// Shared fixtures for the state tests. Three of them declared an identical
// `makeLayout` — duplication inside ONE unit of code, unlike the deliberate
// forking between self-sufficient shelf packages.
import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { CarouselLayout } from "../../domain";
import type { MotionPhase } from "../types";
import type { Slide } from "../../public-api/types";

/**
 * A deck of `slideCount` text slides, laid out for the given page size.
 * `idTag` varies slide identity, which is what makes two layouts differ by
 * `dataKey` — the reconcile tests turn on exactly that.
 */
export const makeLayout = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
  idTag = "a",
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `${idTag}-${i}`,
    content: `slide-${idTag}-${i}`,
  }));
  return buildCarouselLayout(
    buildSlideRecords(slides),
    visibleSlidesCount,
    isFinite,
  );
};

/** Every phase in which the teleport fields must read as invalid. */
export const NON_JUMP_PHASES: readonly MotionPhase[] = [
  "idle",
  "step-normal",
  "step-snap",
  "step-instant",
  "dragging",
];
