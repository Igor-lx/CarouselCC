# config/legacyPaint.ts — no-WAAPI paint pacing

- **`FALLBACK_DROP_EVERY_NTH_FRAME`** — legacy-fallback paint pacing: every Nth
  running frame of a motion is DROPPED (not painted); below the minimum, dropping
  is disabled. On engines with no Web Animations API every motion runs on the
  per-frame JS path, on typically slow hardware — dropping a fixed cadence buys
  paint headroom. One shared constant: the track and the widget both decide
  through `isDroppedFallbackFrame` on the same source-numbered frames, so they
  skip the same frames and stay locked. Resting and finger-drag frames are never
  dropped; never consulted on WAAPI-capable engines.
