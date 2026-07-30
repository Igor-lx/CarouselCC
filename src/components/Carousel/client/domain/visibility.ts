// See docs/architecture/domain.md
import type { SlideAriaProps } from "./types";

// isActual = in the band now; isActive also keeps segment-start slides live.
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

/** How many lanes a slide sits outside the visible band; 0 while inside it. */
export const laneDistanceFromBand = (
  virtualIndex: number,
  bandStart: number,
  visibleSlidesCount: number,
): number => {
  const bandEnd = bandStart + visibleSlidesCount - 1;
  if (virtualIndex < bandStart) return Math.ceil(bandStart - virtualIndex);
  if (virtualIndex > bandEnd) return Math.ceil(virtualIndex - bandEnd);
  return 0;
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
