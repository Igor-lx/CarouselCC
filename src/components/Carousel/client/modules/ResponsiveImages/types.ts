export interface ResponsiveImagesProps {
  /** Master preload switch. Default `true`. */
  isPreloadOn?: boolean;
  /** Neighbour pages to warm on EACH side of the target. Default `1`. */
  preloadPagesNr?: number;
  /**
   * Also warm the parallel orientation's crop (heuristic candidate — see
   * `resolveParallelCandidate`), so the first rotation swaps instantly.
   * Default `false`: it is extra traffic for an event that may never happen.
   */
  isParallelSetPreloadOn?: boolean;
  /**
   * Upgrade the warm from network-only to network + DECODE: candidates are
   * fetched through a detached `Image` and `decode()`d in idle time, so the
   * incoming page's bitmap is ready before the ride ever starts. Motivation:
   * preload warms only the HTTP cache — the decode + first rasterisation
   * then lands MID-RIDE, and on a weak GPU that occasionally costs exactly
   * one vsync (a visible single held frame). Decoded bitmaps are retained
   * only for the current warm window (refs are pruned as the target moves),
   * so memory stays bounded. Default `false`: decoded frames are memory a
   * weak device may not have to spare — measure before enabling.
   */
  isPredecodeOn?: boolean;
}
