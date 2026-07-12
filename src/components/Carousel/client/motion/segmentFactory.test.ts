import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../config";
import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { Slide } from "../public-api/types";
import { buildInitialState } from "../state/initial";
import { carouselReducer } from "../state/reducer";
import type { CarouselCommand, CarouselState } from "../state/types";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";

/**
 * Continuity-launch contract of the gesture-release segment: the ride starts
 * at the VISUAL velocity the eye saw at lift-off and accelerates to the
 * intent speed — it never jumps above the visible speed instantly.
 */

// MECHANISM tests, not tuning tests: the release knobs are PINNED here.
// The project's live values are feel tunables — e.g. accelerationDistanceShare
// of 0 legally switches the continuity ramp off — and hand-tuning must never
// fail these assertions. The pinned values are the documented reference shape
// (ramp present, cruise zone present, floor active).
const RELEASE_KNOBS = {
  inertiaBoost: 1.5,
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.25,
  minRideDurationMs: 200,
};

const config = { ...buildCarouselConfig({}), releaseConfig: RELEASE_KNOBS };

const makeLayout = (slideCount: number, visible: number) => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `s-${i}`,
    content: `slide-${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visible, false);
};

const reduce = (state: CarouselState, command: CarouselCommand): CarouselState =>
  carouselReducer(state, {
    ...command,
    context: { layout: state.layout, config, isInstantMode: false },
  });

/** Release a drag with a calm visual finish but a fast gesture memory. */
const releasedState = (
  uiVelocity: number,
  pointerVelocity: number,
  fromVirtualIndex = -0.4,
) => {
  const layout = makeLayout(12, 3);
  const dragging = reduce(buildInitialState(layout), {
    type: "START_DRAG",
    fromVirtualIndex: 0,
    targetPageIndex: 0,
  });
  return reduce(dragging, {
    type: "END_DRAG",
    fromVirtualIndex,
    targetPageIndex: 1,
    targetVirtualIndex: 3,
    isSnap: false,
    pointerReleaseVelocity: pointerVelocity,
    uiReleaseVelocity: uiVelocity,
    releasedAt: 0,
  });
};

describe("ride-duration floor", () => {
  it("a vigorous flick over a short remaining distance never collapses below the floor", () => {
    // calm visible finish (0.001 u/ms) + huge flick memory: 0.4 remaining
    // units at the boosted intent would be a ~10ms teleport without the floor
    const state = releasedState(0.001, 0.05, 2.6);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });
    // float-tolerant: the solver lands exactly on the floor
    expect(segment.duration).toBeGreaterThanOrEqual(
      RELEASE_KNOBS.minRideDurationMs - 1e-6,
    );
  });

  it("a launch speed that alone beats the floor is never slowed (continuity wins)", () => {
    // the EYE saw 0.05 u/ms at lift-off: a ~10ms ride is continuous with the
    // finger, not a teleport — the floor must not brake the visible speed
    const state = releasedState(0.05, 0.05, 2.6);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });
    expect(segment.duration).toBeLessThan(
      RELEASE_KNOBS.minRideDurationMs,
    );
    const launch = sampleCarouselSegment(segment, 1);
    expect(Math.abs(launch.velocity)).toBeGreaterThan(0.03);
  });

  it("long rides above the floor are untouched by it", () => {
    // ~3.4 units at a moderate speed: raw duration is well above the floor
    const state = releasedState(0.003, 0.003);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });
    expect(segment.duration).toBeGreaterThan(
      RELEASE_KNOBS.minRideDurationMs * 2,
    );
  });
});

describe("gesture-release continuity launch", () => {
  it("starts at the visual (ui) velocity, not the faster gesture memory", () => {
    const uiVelocity = 0.001; // calm visible finish (virtual units / ms)
    const pointerVelocity = 0.01; // fast flick memory
    const state = releasedState(uiVelocity, pointerVelocity);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });

    const launch = sampleCarouselSegment(segment, 1);
    // Launch speed matches what the eye saw (small numeric drift allowed)…
    expect(Math.abs(launch.velocity)).toBeLessThan(uiVelocity * 1.5);

    // …and the ride then ACCELERATES toward the intent cruise: somewhere
    // mid-segment the speed clearly exceeds the launch speed.
    const samples = Array.from({ length: 40 }, (_, i) =>
      Math.abs(
        sampleCarouselSegment(segment, ((i + 1) / 41) * segment.duration).velocity,
      ),
    );
    expect(Math.max(...samples)).toBeGreaterThan(uiVelocity * 3);
  });

  it("a fast lift-off collapses the ramp: launch ≈ cruise, no artificial slowdown", () => {
    const uiVelocity = 0.01;
    const pointerVelocity = 0.01;
    const state = releasedState(uiVelocity, pointerVelocity);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });
    const launch = sampleCarouselSegment(segment, 1);
    const cruisePeak = Math.max(
      ...Array.from({ length: 40 }, (_, i) =>
        Math.abs(
          sampleCarouselSegment(segment, ((i + 1) / 41) * segment.duration).velocity,
        ),
      ),
    );
    // Launch is already at (or близко к) the ride's peak — no dip, no kick.
    expect(Math.abs(launch.velocity)).toBeGreaterThan(cruisePeak * 0.55);
  });
});
