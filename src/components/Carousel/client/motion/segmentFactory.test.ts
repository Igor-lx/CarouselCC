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

const config = buildCarouselConfig({});

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
const releasedState = (uiVelocity: number, pointerVelocity: number) => {
  const layout = makeLayout(12, 3);
  const dragging = reduce(buildInitialState(layout), {
    type: "START_DRAG",
    fromVirtualIndex: 0,
    targetPageIndex: 0,
  });
  return reduce(dragging, {
    type: "END_DRAG",
    fromVirtualIndex: -0.4,
    targetPageIndex: 1,
    targetVirtualIndex: 3,
    isSnap: false,
    pointerReleaseVelocity: pointerVelocity,
    uiReleaseVelocity: uiVelocity,
  });
};

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
