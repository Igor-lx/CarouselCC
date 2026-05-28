export const mod = (value: number, total: number) => {
  if (total <= 0) return 0;
  return ((value % total) + total) % total;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

export const normalizePageIndex = (pageIndex: number, pageCount: number) =>
  pageCount <= 0 ? 0 : mod(pageIndex, pageCount);

export const shortestCyclicDistance = (from: number, to: number, total: number) => {
  if (total <= 0) return 0;
  const forward = mod(to - from, total);
  const backward = forward - total;
  return Math.abs(forward) <= Math.abs(backward) ? forward : backward;
};
