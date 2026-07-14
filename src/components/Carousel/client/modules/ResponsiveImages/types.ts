interface ResponsiveImagesBaseProps {
  /** Neighbour pages to warm on EACH side of the target (current
   * orientation only). Default `1`. */
  preloadPagesNr?: number;
}

/**
 * `isPreloadOn` is the warm manager's MASTER switch; `isPredecodeOn` merely
 * upgrades the warm from network-only to network + decode (decoding without
 * fetching is not a thing). The union makes the dead combination
 * `isPreloadOn: false` + `isPredecodeOn: true` a TYPE error; Diagnostics
 * reports the same at runtime for untyped call sites.
 */
export type ResponsiveImagesProps = ResponsiveImagesBaseProps &
  (
    | {
        /** Master warm switch. Default `true`. */
        isPreloadOn?: true;
        /**
         * Upgrade the warm from network-only to network + DECODE: neighbour
         * candidates load through detached `Image`s and are `decode()`d one
         * at a time in idle callbacks, so the incoming page's bitmap is
         * ready before the ride ever starts. Motivation: a network-only
         * warm leaves the decode + first rasterisation to land MID-RIDE,
         * and on a weak GPU that occasionally costs exactly one vsync (a
         * visible single held frame). Decoded bitmaps are retained only for
         * the current warm window (refs are pruned as the target moves), so
         * memory stays bounded. Default `false`: decoded frames are memory
         * a weak device may not have to spare — measure before enabling.
         */
        isPredecodeOn?: boolean;
      }
    | {
        isPreloadOn: false;
        isPredecodeOn?: false;
      }
  );
