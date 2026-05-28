const TRANSFORM_PRECISION = 10_000;

const roundedPx = (value: number) =>
  Number.isFinite(value)
    ? Math.round(value * TRANSFORM_PRECISION) / TRANSFORM_PRECISION
    : 0;

export const trackPixelTransform = (
  position: number,
  renderWindowStart: number,
  slotSize: number,
): string => {
  const relative = position - renderWindowStart;
  const offset = -relative * slotSize;
  return `translate3d(${roundedPx(offset)}px, 0, 0)`;
};

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

export const slideFlexStyle = (visibleSlidesCount: number): { flex: string } => ({
  flex: `0 0 calc((100% - (var(--slides-gap, 0px) * ${visibleSlidesCount - 1})) / ${visibleSlidesCount})`,
});

export const pointerVelocityToVirtual = (pointerVelocity: number, slotSize: number) => {
  if (!(slotSize > 0)) return 0;
  return -(pointerVelocity / slotSize);
};
