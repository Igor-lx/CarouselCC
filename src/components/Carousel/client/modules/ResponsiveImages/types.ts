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
  /** Honour the host's data-saver signal (zero warm traffic). Default `true`. */
  isDataSaverRespected?: boolean;
}
