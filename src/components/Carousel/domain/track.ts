const TRANSFORM_PRECISION = 10_000;

const roundedPx = (value: number) =>
  Number.isFinite(value)
    ? Math.round(value * TRANSFORM_PRECISION) / TRANSFORM_PRECISION
    : 0;

/**
 * Build a `translate3d(...)` string for the track. Used when a pixel slot
 * size has been measured.
 */
export const trackPixelTransform = (
  position: number,
  renderWindowStart: number,
  slotSize: number,
): string => {
  const relative = position - renderWindowStart;
  const offset = -relative * slotSize;
  return `translate3d(${roundedPx(offset)}px, 0, 0)`;
};

/**
 * Fallback transform expressed in `calc(...)` against the viewport width
 * and the SCSS-provided gap CSS variable. Used before the first pixel
 * measurement and as a safety net if the measurement is unavailable.
 */
export const trackCssTransform = (
  position: number,
  renderWindowStart: number,
  visibleSlidesCount: number,
): string => {
  const relative = position - renderWindowStart;
  return `translateX(calc(-${relative} * (100% + var(--slides-gap, 0px)) / ${visibleSlidesCount})) translateX(0px)`;
};

const parseLength = (raw: string) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
};

/**
 * Slot size = (viewport width + gap) / visibleSlidesCount. The gap is read
 * from the closest defined CSS variable on the viewport (`--slides-gap`,
 * `--gap`, `gap`, `column-gap`).
 */
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

/**
 * Build a flex style that gives each slide exactly `1/visibleSlidesCount`
 * of the viewport width minus the gaps. Used as inline style for each slide.
 */
export const slideFlexStyle = (visibleSlidesCount: number): { flex: string } => ({
  flex: `0 0 calc((100% - (var(--slides-gap, 0px) * ${visibleSlidesCount - 1})) / ${visibleSlidesCount})`,
});

/**
 * Translate pointer pixel velocity into "virtual index per millisecond".
 * Negative because moving the pointer to the right reduces the virtual
 * index (the track shifts leftward in screen coordinates).
 */
export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!Number.isFinite(pointerVelocity) || !(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
