# config/legacyPaint.ts — no-WAAPI paint pacing

- **`FALLBACK_DROP_EVERY_NTH_FRAME`** — legacy-fallback paint pacing: every Nth
  running frame of a motion is DROPPED (not painted); below the minimum, dropping
  is disabled. On engines with no Web Animations API every motion runs on the
  per-frame JS path, on typically slow hardware — dropping a fixed cadence buys
  paint headroom. One shared constant, and THREE paint consumers
  decide by it: the track, the fixed dots and the widget strip — the last two
  through `modules/Pagination/useOffsetFollow`, which both ride. Each evaluates
  `isDroppedFallbackFrame` on the same source-numbered frames, so all three skip
  the same frames and stay locked. Naming only two of them, as this file did,
  reads as a licence for the third to paint every frame. Resting and finger-drag frames are never
  dropped; never consulted on WAAPI-capable engines.
