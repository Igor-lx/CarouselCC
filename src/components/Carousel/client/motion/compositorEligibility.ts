import type { CarouselSegment, EasingSegment } from "./types";

/**
 * Whether a segment's track translation can run on the compositor thread via
 * the Web Animations API instead of the JS sampler.
 *
 * Eligibility is exactly "is this an `EasingSegment`": a fixed cubic-bezier
 * translation of the whole track from `from` to `to` over `duration` is
 * reproduced exactly by a single two-keyframe `Element.animate(...)` plus a CSS
 * easing string. That covers every duration-authored bezier step regardless of
 * who triggered it:
 *  - `"easing"`        — click, autoplay, snap-back;
 *  - `"gesture-easing"`— a non-inertial gesture release. The release hands off
 *    from a *static* position (the finger is already up), which
 *    `startCompositorMotion` paints synchronously as the first frame, so there
 *    is no live-drag continuity to preserve on the JS path.
 *
 * `ProfileSegment` strategies (`gesture` inertial release, `repeated`, `jump`)
 * carry speed-authored accel/cruise/decel shapes, teleport discontinuities, or
 * inertial velocity that one CSS easing curve cannot express — they stay on the
 * JS sampler. The JS controller still samples every segment regardless of
 * compositing; it remains the visual-position SSOT.
 */
export const canUseCompositorTrackMotion = (
  segment: CarouselSegment,
): segment is EasingSegment =>
  segment.strategy === "easing" || segment.strategy === "gesture-easing";
