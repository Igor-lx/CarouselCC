// See docs/architecture/domain.md
const TRANSFORM_PRECISION = 10_000;

const roundedPx = (value: number) =>
  Number.isFinite(value)
    ? Math.round(value * TRANSFORM_PRECISION) / TRANSFORM_PRECISION
    : 0;

// `layoutOrigin` is deliberately not the render-window start — it stays stable
// across window shifts, so a shift never re-rasters a slide (see doc).
export const trackPixelTransform = (
  position: number,
  layoutOrigin: number,
  slotSize: number,
): string => {
  const relative = position - layoutOrigin;
  const offset = -relative * slotSize;
  return `translate3d(${roundedPx(offset)}px, 0, 0)`;
};

export const trackCssTransform = (
  position: number,
  layoutOrigin: number,
  visibleSlidesCount: number,
): string => {
  const relative = position - layoutOrigin;
  return `translateX(calc(-${relative} * (100% + var(--slides-gap, 0px)) / ${visibleSlidesCount})) translateX(0px)`;
};

/** The slide's lane (`--slide-lane`): SCSS owns the rule, JS only the number. */
export const slideLane = (virtualIndex: number, layoutOrigin: number): number =>
  virtualIndex - layoutOrigin;

const parseLength = (raw: string) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
};

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

// Negative: moving the pointer right lowers the virtual index.
export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
