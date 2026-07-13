import type { CSSProperties } from "react";

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
 * Inline style POSITIONING one slide at its own virtual lane, independent of
 * every other slide. Width is `1/visibleSlidesCount` of the track (minus the
 * shared gaps); the horizontal placement is a `translateX` of the slide's
 * lane (`virtualIndex - layoutOrigin`) times one slot stride. Because
 * `translateX(100%)` on an absolutely-positioned slide is its OWN width, and
 * slide width + gap === one slot stride, `(100% + gap)` is exactly one lane
 * step. A slide's lane is fixed for its lifetime (its virtualIndex never
 * changes while mounted, and `layoutOrigin` is stable across window shifts),
 * so mounting or unmounting a neighbour never moves it — the whole point.
 */
export const slideLaneStyle = (
  virtualIndex: number,
  layoutOrigin: number,
  visibleSlidesCount: number,
): CSSProperties => ({
  width: `calc((100% - var(--slides-gap, 0px) * ${visibleSlidesCount - 1}) / ${visibleSlidesCount})`,
  transform: `translateX(calc(${virtualIndex - layoutOrigin} * (100% + var(--slides-gap, 0px))))`,
});

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
 * Width-only style for the always-present height sizer: one slot wide (so the
 * track derives its height from `aspect-ratio` exactly as a slide would),
 * kept in normal flow because absolutely-positioned slides contribute no
 * height. See `.slideSizer` in the stylesheet.
 */
export const slideSizerStyle = (visibleSlidesCount: number): { width: string } => ({
  width: `calc((100% - var(--slides-gap, 0px) * ${visibleSlidesCount - 1}) / ${visibleSlidesCount})`,
});

/**
 * Translate pointer pixel velocity into "virtual index per millisecond".
 * Negative because moving the pointer to the right reduces the virtual
 * index (the track shifts leftward in screen coordinates).
 */
export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
