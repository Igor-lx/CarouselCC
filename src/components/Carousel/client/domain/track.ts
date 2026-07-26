const TRANSFORM_PRECISION = 10_000;

const roundedPx = (value: number) =>
  Number.isFinite(value)
    ? Math.round(value * TRANSFORM_PRECISION) / TRANSFORM_PRECISION
    : 0;

/**
 * `translate3d(...)` that SCROLLS the track, used once a pixel slot size is
 * measured. `layoutOrigin` is DELIBERATELY not the render-window start: the
 * origin is stable across window shifts, so the transform re-baselines only on
 * a rare recenter and a window shift never moves a slide (no re-raster).
 */
export const trackPixelTransform = (
  position: number,
  layoutOrigin: number,
  slotSize: number,
): string => {
  const relative = position - layoutOrigin;
  const offset = -relative * slotSize;
  return `translate3d(${roundedPx(offset)}px, 0, 0)`;
};

/** Fallback `calc(...)` scroll transform against track width and the gap CSS
 * variable — used before the first pixel measurement, or if none is available. */
export const trackCssTransform = (
  position: number,
  layoutOrigin: number,
  visibleSlidesCount: number,
): string => {
  const relative = position - layoutOrigin;
  return `translateX(calc(-${relative} * (100% + var(--slides-gap, 0px)) / ${visibleSlidesCount})) translateX(0px)`;
};

/**
 * The slide's LANE: its position in slot strides from the layout origin, handed
 * to the stylesheet as `--slide-lane` (SCSS owns the RULE, JS only the NUMBER).
 * Fixed for the slide's mounted lifetime, so mounting or unmounting a neighbour
 * never moves it — the point of the stable-lane layout.
 */
export const slideLane = (virtualIndex: number, layoutOrigin: number): number =>
  virtualIndex - layoutOrigin;

const parseLength = (raw: string) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
};

/** Slot size = (viewport width + gap) / visibleSlidesCount; the gap is the first
 * defined of `--slides-gap`, `--gap`, `gap`, `column-gap` on the viewport. */
export const measureSlotSize = (
  viewport: HTMLElement,
  visibleSlidesCount: number,
  viewportWidth = viewport.offsetWidth,
): number => {
  if (!(visibleSlidesCount > 0)) return 0;
  const styles = window.getComputedStyle(viewport);
  const gapRaw =
    styles.getPropertyValue("--slides-gap") ||
    styles.getPropertyValue("--gap") ||
    styles.getPropertyValue("gap") ||
    styles.getPropertyValue("column-gap");
  const gap = parseLength(gapRaw);
  return (viewportWidth + gap) / visibleSlidesCount;
};

/** Pointer pixel velocity → virtual index per millisecond. Negative: moving the
 * pointer right lowers the virtual index (the track shifts left on screen). */
export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
