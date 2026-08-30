// See docs/architecture/domain.md
export const mod = (value: number, total: number) => {
  if (!(total > 0)) return 0;
  return ((value % total) + total) % total;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

export const normalizePageIndex = (pageIndex: number, pageCount: number) =>
  !(pageCount > 0) ? 0 : mod(pageIndex, pageCount);
