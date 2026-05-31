import { clamp } from "./math";
import type { CarouselLayout, RenderWindow } from "./types";

/**
 * Builds the "buffered" render window around a motion segment. During a
 * normal idle state `from === to`, so the window is a single segment plus
 * the buffer; during a motion segment the window covers both endpoints.
 */
export const buildRenderWindow = (
  fromVirtualIndex: number,
  toVirtualIndex: number,
  layout: CarouselLayout,
  renderWindowBufferMultiplier: number,
): RenderWindow => {
  if (!layout.canSlide) {
    return {
      start: 0,
      end: Math.max(0, layout.length - 1),
    };
  }

  const segmentStart = Math.floor(Math.min(fromVirtualIndex, toVirtualIndex));
  const segmentEnd =
    Math.ceil(Math.max(fromVirtualIndex, toVirtualIndex)) +
    layout.visibleSlidesCount -
    1;
  const buffer = layout.visibleSlidesCount * renderWindowBufferMultiplier;

  if (layout.isFinite) {
    return {
      start: clamp(segmentStart - buffer, 0, Math.max(0, layout.length - 1)),
      end: clamp(segmentEnd + buffer, 0, Math.max(0, layout.length - 1)),
    };
  }

  return {
    start: segmentStart - buffer,
    end: segmentEnd + buffer,
  };
};

/**
 * The minimum window that strictly contains the current motion segment,
 * without buffer. Used to decide whether the previously-set buffered window
 * still covers an ongoing motion.
 */
export const buildSegmentWindow = (
  fromVirtualIndex: number,
  toVirtualIndex: number,
  layout: CarouselLayout,
): RenderWindow => ({
  start: Math.floor(Math.min(fromVirtualIndex, toVirtualIndex)),
  end:
    Math.ceil(Math.max(fromVirtualIndex, toVirtualIndex)) +
    layout.visibleSlidesCount -
    1,
});

export const windowContains = (outer: RenderWindow, inner: RenderWindow) =>
  outer.start <= inner.start && outer.end >= inner.end;

export const expandWindow = (current: RenderWindow, next: RenderWindow): RenderWindow => ({
  start: Math.min(current.start, next.start),
  end: Math.max(current.end, next.end),
});
