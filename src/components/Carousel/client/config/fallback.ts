/**
 * Legacy-fallback paint pacing: every Nth running frame of a motion is
 * DROPPED (not painted), so `4` means "skip every 4th frame" — i.e. 3 of
 * every 4 running frames paint. Values below `2` disable dropping entirely.
 *
 * Why it exists: on engines with no Web Animations API the per-frame JS path
 * carries EVERY engine-driven motion (pre-WAAPI style), on typically slow
 * hardware — dropping a fixed cadence of frames buys paint headroom. ONE
 * shared constant for every consumer: the track and the pagination widget
 * both decide through `isDroppedFallbackFrame` on the same source-numbered
 * frames, so they always skip exactly the same frames and stay visually
 * locked.
 *
 * Resting frames (settle, idle emits) and finger-drag frames are never
 * dropped. Never consulted on WAAPI-capable engines.
 */
export const FALLBACK_DROP_EVERY_NTH_FRAME = 4;
