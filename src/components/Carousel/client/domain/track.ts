const TRANSFORM_PRECISION = 10_000;

const roundedPx = (value: number) =>
  Number.isFinite(value)
    ? Math.round(value * TRANSFORM_PRECISION) / TRANSFORM_PRECISION
    : 0;

/**
 * Build a `translate3d(...)` string that SCROLLS the track. Used when a pixel
 * slot size has been measured.
 *
 * `layoutOrigin` is the coordinate base the slides are positioned against
 * (see `slideLaneStyle`). It is DELIBERATELY not the render-window start: the
 * window shifts by a slot on every settle (it decides which slides are
 * mounted), whereas the origin is stable across those shifts — so the scroll
 * transform re-baselines only on a rare origin recenter, never per ride, and
 * a window shift moves no slide relative to the track (no re-raster).
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

/**
 * Fallback scroll transform expressed in `calc(...)` against the track width
 * and the SCSS-provided gap CSS variable. Used before the first pixel
 * measurement and as a safety net if the measurement is unavailable.
 */
export const trackCssTransform = (
  position: number,
  layoutOrigin: number,
  visibleSlidesCount: number,
): string => {
  const relative = position - layoutOrigin;
  return `translateX(calc(-${relative} * (100% + var(--slides-gap, 0px)) / ${visibleSlidesCount})) translateX(0px)`;
};

/**
 * The slide's LANE: its position in slot strides from the layout origin. The
 * only per-slide layout datum JS owns — it is handed to the stylesheet as the
 * `--slide-lane` custom property, and `.slide` turns it into a `translateX`
 * (see the stylesheet: one lane step is `100% + --slides-gap`, i.e. the slide's
 * own width plus a gap === one slot stride). Keeping the RULE in SCSS and only
 * the NUMBER here is the same split the widget uses for its dot geometry.
 *
 * A slide's lane is fixed for its mounted lifetime (its `virtualIndex` never
 * changes while mounted, and `layoutOrigin` is stable across window shifts),
 * so mounting or unmounting a neighbour never moves it — the whole point of
 * the stable-lane layout.
 */
export const slideLane = (virtualIndex: number, layoutOrigin: number): number =>
  virtualIndex - layoutOrigin;

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
 * Translate pointer pixel velocity into "virtual index per millisecond".
 * Negative because moving the pointer to the right reduces the virtual
 * index (the track shifts leftward in screen coordinates).
 */
export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
