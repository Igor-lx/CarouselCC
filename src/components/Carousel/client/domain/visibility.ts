import type { SlideAriaProps } from "./types";

/**
 * `isActual` is "this slide is inside the visible band right now".
 * `isActive` extends the band during motion to also include slides that were
 * visible at the start of the segment, so they stay interactive throughout
 * the transition.
 */
export const slideVisibilityFlags = (
  virtualIndex: number,
  currentVirtualIndex: number,
  previousVirtualIndex: number,
  visibleSlidesCount: number,
  isMoving: boolean,
): { isActual: boolean; isActive: boolean } => {
  const isActual =
    virtualIndex >= currentVirtualIndex &&
    virtualIndex < currentVirtualIndex + visibleSlidesCount;

  if (!isMoving) return { isActual, isActive: isActual };

  const startIndex = Math.floor(previousVirtualIndex);
  const wasVisible =
    virtualIndex >= startIndex &&
    virtualIndex < Math.ceil(previousVirtualIndex + visibleSlidesCount);

  return { isActual, isActive: isActual || wasVisible };
};

export const buildSlideAriaProps = (
  layoutIndex: number,
  isActual: boolean,
  totalSlides: number,
): SlideAriaProps => ({
  role: "group",
  "aria-roledescription": "slide",
  "aria-label": `${layoutIndex + 1} of ${totalSlides}`,
  ...(isActual ? { "aria-current": "step" as const } : {}),
});
