# config/layout.ts — render-window buffer

- **`RENDER_WINDOW_BUFFER_MULTIPLIER`** — render-window buffer in page screens.
  It pre-mounts, while the deck is idle, every slide a single click or a
  repeated-click lookahead can reveal, so starting a motion never mounts slides
  into the moving track layer (a click-time mount would force commit + raster
  exactly when motion begins — a visible mobile hitch — whereas the idle mount
  is invisible). The cost is a wider idle DOM. Must be ≥ the repeated-click
  lookahead (diagnosed). See [../architecture/slides.md](../architecture/slides.md).
