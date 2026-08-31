// See docs/architecture/domain.md
export const mod = (value: number, total: number) => {
  if (!(total > 0)) return 0;
  return ((value % total) + total) % total;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/** A page index wrapped into a cyclic deck. `0` for a deck with no pages. */
export const normalizePageIndex = (pageIndex: number, pageCount: number) =>
  mod(pageIndex, pageCount);
