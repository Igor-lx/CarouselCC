import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../../config";
import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { Slide } from "../../public-api/types";
import { buildInitialState } from "../../state/initial";
import { carouselReducer } from "../../state/reducer";
import type { CarouselCommand, CarouselState } from "../../state/types";
import { buildCarouselSegment } from "../segmentFactory";
import {
  resolveGoToApproachDuration,
  resolveGoToFlightDuration,
  resolveJumpPeakSpeed,
} from "../timing";
import { sampleCarouselSegment } from "../sampler";

/**
 * Continuity-launch contract of the gesture-release segment: the ride starts
 * at the VISUAL velocity the eye saw at lift-off and accelerates to the
 * intent speed вЂ” it never jumps above the visible speed instantly.
 */

// MECHANISM tests, not tuning tests: the release knobs are PINNED here.
// The project's live values are feel tunables вЂ” e.g. accelerationDistanceShare
// of 0 legally switches the continuity ramp off вЂ” and hand-tuning must never
// fail these assertions. The pinned values are the documented reference shape
// (ramp present, cruise zone present, floor active).
const RELEASE_KNOBS = {
  inertiaBoost: 1.5,
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.25,
  minRideDurationMs: 200,
};

// `durationStep` is pinned too: the release's base duration (and with it the
// intent-speed floor) derives from it, and the duration assertions below
// compare against it.
const config = {
  ...buildCarouselConfig({ durationStep: 800 }),
  releaseConfig: RELEASE_KNOBS,
};

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
    // The continuity launch reads `launchVelocity` вЂ” the visible speed judged
    // over the gesture, not the last-two-frames reading that a micro-hold before
    // lift-off zeroes. These cases model the visible finish, so it is that.
    launchVelocity: uiVelocity,
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
    // finger, not a teleport вЂ” the floor must not brake the visible speed
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
    // Launch speed matches what the eye saw (small numeric drift allowed)вЂ¦
    expect(Math.abs(launch.velocity)).toBeLessThan(uiVelocity * 1.5);

    // вЂ¦and the ride then ACCELERATES toward the intent cruise: somewhere
    // mid-segment the speed clearly exceeds the launch speed.
    const samples = Array.from({ length: 40 }, (_, i) =>
      Math.abs(
        sampleCarouselSegment(segment, ((i + 1) / 41) * segment.duration).velocity,
      ),
    );
    expect(Math.max(...samples)).toBeGreaterThan(uiVelocity * 3);
  });

  it("a fast lift-off collapses the ramp: launch в‰€ cruise, no artificial slowdown", () => {
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
    // Launch is already at (or close to) the ride's peak вЂ” no dip, no kick.
    expect(Math.abs(launch.velocity)).toBeGreaterThan(cruisePeak * 0.55);
  });
});

describe("a micro-hold before lift-off must not launch the ride from a standstill", () => {
  /**
   * The defect this guards against, measured on a Redmi Note 11S: finishing a
   * slow, deliberate swipe, the finger holds still for ~2 frames before lifting.
   * The launch velocity used to be read off the fast per-frame EMA, which such a
   * hold zeroes вЂ” so the ride launched from rest and crawled through its whole
   * acceleration ramp (~300 ms at 3 px/frame) before picking up speed. Every
   * frame was delivered on time and no counter saw a thing: the CURVE stalled.
   *
   * `launchVelocity` carries the visible speed on the flick's pause-protected
   * law, and the segment must launch from THAT вЂ” not from the zeroed reading.
   */
  it("launches at the pause-protected visible speed, not at the zeroed instant reading", () => {
    const held = 0.0000001; // the instant reading a 2-frame hold leaves behind
    const visible = 0.006; // what the strip was visibly carrying
    const pointerVelocity = 0.01;

    const state = releasedState(held, pointerVelocity);
    const launched = {
      ...state,
      gesture: { ...state.gesture, launchVelocity: visible },
    };

    const { segment } = buildCarouselSegment({
      state: launched,
      config,
      isInstantMode: false,
      start: { position: launched.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });

    const launch = sampleCarouselSegment(segment, 1);
    expect(Math.abs(launch.velocity)).toBeGreaterThan(visible * 0.5);
  });

  it("still starts from rest when the strip really was at rest", () => {
    // A long, deliberate stop decays launchVelocity too вЂ” and then a ride that
    // begins at rest is CORRECT. The fix must not paper over that.
    const state = releasedState(0, 0.01);
    const stopped = {
      ...state,
      gesture: { ...state.gesture, launchVelocity: 0 },
    };

    const { segment } = buildCarouselSegment({
      state: stopped,
      config,
      isInstantMode: false,
      start: { position: stopped.fromVirtualIndex, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });

    expect(Math.abs(sampleCarouselSegment(segment, 1).velocity)).toBeLessThan(0.001);
  });
});

/**
 * Flight-envelope time ceiling of a GO_TO ride (teleport ON).
 *
 * MECHANISM tests with PINNED GO_TO knobs (the live values are feel
 * tunables): the contract is that with the teleport enabled no continuous
 * ride ever takes LONGER than a flight, so ride and flight durations meet
 * seamlessly at the gate вЂ” for ANY preflight/approach/gate ratio. With the
 * teleport disabled the ceiling must NOT apply: one shared cruise speed,
 * duration grows with distance.
 */
describe("GO_TO flight-envelope time ceiling", () => {
  const PINNED_GO_TO = {
    goToTeleportEnabled: true,
    goToPreflightPageSpan: 1,
    goToFinalApproachPageSpan: 1,
    goToTeleportMinPageSpan: 3,
    goToAccelerationDistanceShare: 0.35,
    goToDecelerationDistanceShare: 0.35,
    goToSpeedMultiplier: 10,
  };

  const makeGoToConfig = (overrides: Partial<typeof PINNED_GO_TO> = {}) => {
    const built = buildCarouselConfig({ durationStep: 1000 });
    return {
      ...built,
      motion: { ...built.motion, ...PINNED_GO_TO, ...overrides },
    };
  };

  /** Issue a GO_TO from page 0 and build its first (ride or preflight) segment. */
  const jumpFrom0 = (cfg: ReturnType<typeof makeGoToConfig>, targetPageIndex: number) => {
    const layout = makeLayout(30, 3); // pageCount 10, stepSize 3
    const state = carouselReducer(buildInitialState(layout), {
      type: "GO_TO",
      targetPageIndex,
      moveReason: "click",
      fromVirtualIndex: 0,
      context: { layout, config: cfg, isInstantMode: false },
    });
    const { segment } = buildCarouselSegment({
      state,
      config: cfg,
      isInstantMode: false,
      start: { position: 0, velocity: 0, strategy: "idle" },
      startedAt: 0,
    });
    return { state, segment };
  };

  const flightEnvelope = (cfg: ReturnType<typeof makeGoToConfig>) =>
    resolveGoToFlightDuration(
      3,
      cfg.motion,
      resolveJumpPeakSpeed(3, cfg.stepDuration, cfg.motion.goToSpeedMultiplier),
    );

  it("the widest still-riding jump is time-capped to exactly the flight duration", () => {
    const cfg = makeGoToConfig();
    const { state, segment } = jumpFrom0(cfg, 3); // span 3: rides (2 intermediates, both shown)
    expect(state.teleportVirtualIndex).toBeNull();
    expect(segment.duration).toBeCloseTo(flightEnvelope(cfg), 4);
  });

  it("rides at or under the envelope keep the shared cruise untouched", () => {
    const enabled = makeGoToConfig();
    const disabled = makeGoToConfig({ goToTeleportEnabled: false });
    for (const target of [1, 2]) {
      const withCeiling = jumpFrom0(enabled, target).segment.duration;
      const freeRide = jumpFrom0(disabled, target).segment.duration;
      expect(withCeiling).toBeCloseTo(freeRide, 6);
    }
  });

  it("durations are monotonic and the ride/flight seam matches", () => {
    const cfg = makeGoToConfig();
    const d1 = jumpFrom0(cfg, 1).segment.duration;
    const d2 = jumpFrom0(cfg, 2).segment.duration;
    const d3 = jumpFrom0(cfg, 3).segment.duration; // capped ride
    // span 4+ flies: preflight segment + precomputable approach = full flight
    const { state: far, segment: preflight } = jumpFrom0(cfg, 4);
    expect(far.teleportVirtualIndex).not.toBeNull();
    const peak = resolveJumpPeakSpeed(3, cfg.stepDuration, cfg.motion.goToSpeedMultiplier);
    const flightTotal =
      preflight.duration + resolveGoToApproachDuration(3, cfg.motion, peak);
    expect(d1).toBeLessThanOrEqual(d2 + 1e-9);
    expect(d2).toBeLessThanOrEqual(d3 + 1e-9);
    expect(d3).toBeCloseTo(flightTotal, 4);
  });

  it("disabled teleport: far jumps ride the full distance with NO ceiling", () => {
    const cfg = makeGoToConfig({ goToTeleportEnabled: false });
    const { state, segment } = jumpFrom0(cfg, 8); // span 8 would fly when enabled
    expect(state.teleportVirtualIndex).toBeNull();
    expect(segment.duration).toBeGreaterThan(flightEnvelope(cfg) * 2);
    // consistent SPEED, not consistent time: farther rides take longer
    expect(segment.duration).toBeGreaterThan(jumpFrom0(cfg, 3).segment.duration);
  });

  it("holds for a different preflight/approach/gate ratio (tuning-agnostic)", () => {
    const cfg = makeGoToConfig({
      goToPreflightPageSpan: 2,
      goToFinalApproachPageSpan: 1,
      goToTeleportMinPageSpan: 6,
    });
    // spans 4..6 all ride (intermediates 3..5 < gate 6) вЂ” every one capped
    const d4 = jumpFrom0(cfg, 4).segment.duration;
    const d6 = jumpFrom0(cfg, 6).segment.duration;
    expect(jumpFrom0(cfg, 6).state.teleportVirtualIndex).toBeNull();
    expect(d4).toBeCloseTo(flightEnvelope(cfg), 4);
    expect(d6).toBeCloseTo(flightEnvelope(cfg), 4);
    // span 7 (6 intermediates >= gate, > 3 shown) flies
    expect(jumpFrom0(cfg, 7).state.teleportVirtualIndex).not.toBeNull();
  });
});
