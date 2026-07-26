/**
 * Render-window buffer in page screens. Larger values keep more neighbouring
 * slides mounted around the visible band.
 *
 * It pre-mounts, while the deck is idle, every slide a single click or a
 * repeated-click lookahead can reveal, so starting a motion never mounts slides
 * into the moving track layer — a click-time mount would force commit + raster
 * of the track exactly when motion begins (a visible mobile hitch), whereas the
 * idle mount/raster is invisible. The cost is a wider idle DOM. Must be >= the
 * repeated-click lookahead (diagnosed).
 */
export const RENDER_WINDOW_BUFFER_MULTIPLIER = 2;
