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

/** A state fixture carrying the context this suite decides with. */
const initialState = (
  layout: Parameters<typeof buildInitialState>[0],
  suiteConfig = config,
): CarouselState => buildInitialState(layout, suiteConfig);

const reduce = (
  state: CarouselState,
  command: CarouselCommand,
): CarouselState => carouselReducer(state, command);

/** Release a drag with a calm visual finish but a fast gesture memory. */
const releasedState = (
  uiVelocity: number,
  pointerVelocity: number,
  fromVirtualIndex = -0.4,
) => {
  const layout = makeLayout(12, 3);
  const dragging = reduce(initialState(layout), {
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
    // The continuity launch reads `launchVelocity` — the visible speed judged
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
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
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
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });
    expect(segment.duration).toBeLessThan(RELEASE_KNOBS.minRideDurationMs);
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
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });
    expect(segment.duration).toBeGreaterThan(
      RELEASE_KNOBS.minRideDurationMs * 2,
    );
  });
});

/**
 * Everything that is NOT speed-authored — no flick, no jump, no snap — lands
 * in the shared step-duration resolver, and there `moveReason` alone picks the
 * tempo. Two of its arms carry a promise:
 *
 *  - a committed but unhurried swipe (slower than the base tempo, so no
 *    inertial profile) rides at the CLICK tempo. The `gesture` arm returns the
 *    same value as `click` while the neighbouring `default` returns the
 *    AUTOPLAY one, so a tidy-up that collapses or drops it makes an ordinary
 *    slow swipe crawl at autoplay pace;
 *  - an autoplay step rides at `durationAutoplay`, the public prop that exists
 *    for exactly that. Nothing else in the suite follows that prop all the way
 *    into a segment, so a host setting it could be ignored in silence.
 *
 * Both failures move the deck to the right page at the wrong speed: no error,
 * no wrong state, just the wrong feel.
 */
describe("step tempo by move reason", () => {
  const span = (state: CarouselState) =>
    Math.abs(state.virtualIndex - state.fromVirtualIndex) /
    state.layout.visibleSlidesCount;

  it("a committed but unhurried release rides at the click tempo", () => {
    // Release speed well under the base tempo => not a flick.
    const state = releasedState(0.0001, 0.0001);
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });

    // Derived from the config, not written as a number: retuning the step
    // duration must move this expectation rather than break it.
    expect(segment.duration).toBeCloseTo(config.stepDuration * span(state), 6);
    expect(segment.duration).not.toBeCloseTo(config.autoplayDuration, 0);
  });

  it("an autoplay step rides at durationAutoplay, whatever the distance", () => {
    const layout = makeLayout(12, 3);
    const state = reduce(initialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "autoplay",
      fromVirtualIndex: 0,
    });
    const { segment } = buildCarouselSegment({
      state,
      config,
      isInstantMode: false,
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });

    expect(segment.duration).toBeCloseTo(config.autoplayDuration, 6);
    // The distinguishing half: the click tempo is a different number here.
    expect(config.stepDuration * span(state)).not.toBeCloseTo(
      config.autoplayDuration,
      0,
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
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });

    const launch = sampleCarouselSegment(segment, 1);
    // Launch speed matches what the eye saw (small numeric drift allowed)…
    expect(Math.abs(launch.velocity)).toBeLessThan(uiVelocity * 1.5);

    // …and the ride then ACCELERATES toward the intent cruise: somewhere
    // mid-segment the speed clearly exceeds the launch speed.
    const samples = Array.from({ length: 40 }, (_, i) =>
      Math.abs(
        sampleCarouselSegment(segment, ((i + 1) / 41) * segment.duration)
          .velocity,
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
      start: {
        position: state.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });
    const launch = sampleCarouselSegment(segment, 1);
    const cruisePeak = Math.max(
      ...Array.from({ length: 40 }, (_, i) =>
        Math.abs(
          sampleCarouselSegment(segment, ((i + 1) / 41) * segment.duration)
            .velocity,
        ),
      ),
    );
    // Launch is already at (or close to) the ride's peak — no dip, no kick.
    expect(Math.abs(launch.velocity)).toBeGreaterThan(cruisePeak * 0.55);
  });
});

describe("a micro-hold before lift-off must not launch the ride from a standstill", () => {
  /**
   * Finishing a slow, deliberate swipe, a finger holds still for ~2 frames
   * before lifting. A launch velocity read off the fast per-frame EMA is zeroed
   * by such a hold, so the ride would launch from rest and crawl through its
   * whole acceleration ramp before picking up speed — and nothing detects it:
   * every frame is delivered on time, the CURVE stalls.
   *
   * `launchVelocity` carries the visible speed on the flick's pause-protected
   * law, and the segment must launch from THAT — not from the zeroed reading.
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
      start: {
        position: launched.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });

    const launch = sampleCarouselSegment(segment, 1);
    expect(Math.abs(launch.velocity)).toBeGreaterThan(visible * 0.5);
  });

  it("still starts from rest when the strip really was at rest", () => {
    // A long, deliberate stop decays launchVelocity too — and then a ride that
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
      start: {
        position: stopped.fromVirtualIndex,
        velocity: 0,
        strategy: "idle",
      },
      startedAt: 0,
    });

    expect(Math.abs(sampleCarouselSegment(segment, 1).velocity)).toBeLessThan(
      0.001,
    );
  });
});

/**
 * Flight-envelope time ceiling of a GO_TO ride (teleport ON).
 *
 * MECHANISM tests with PINNED GO_TO knobs (the live values are feel
 * tunables): the contract is that with the teleport enabled no continuous
 * ride ever takes LONGER than a flight, so ride and flight durations meet
 * seamlessly at the gate — for ANY preflight/approach/gate ratio. With the
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
  const jumpFrom0 = (
    cfg: ReturnType<typeof makeGoToConfig>,
    targetPageIndex: number,
  ) => {
    const layout = makeLayout(30, 3); // pageCount 10, stepSize 3
    // The GO_TO config under test is the one the state carries.
    const state = carouselReducer(initialState(layout, cfg), {
      type: "GO_TO",
      targetPageIndex,
      moveReason: "click",
      fromVirtualIndex: 0,
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
    const peak = resolveJumpPeakSpeed(
      3,
      cfg.stepDuration,
      cfg.motion.goToSpeedMultiplier,
    );
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
    expect(segment.duration).toBeGreaterThan(
      jumpFrom0(cfg, 3).segment.duration,
    );
  });

  it("holds for a different preflight/approach/gate ratio (tuning-agnostic)", () => {
    const cfg = makeGoToConfig({
      goToPreflightPageSpan: 2,
      goToFinalApproachPageSpan: 1,
      goToTeleportMinPageSpan: 6,
    });
    // spans 4..6 all ride (intermediates 3..5 < gate 6) — every one capped
    const d4 = jumpFrom0(cfg, 4).segment.duration;
    const d6 = jumpFrom0(cfg, 6).segment.duration;
    expect(jumpFrom0(cfg, 6).state.teleportVirtualIndex).toBeNull();
    expect(d4).toBeCloseTo(flightEnvelope(cfg), 4);
    expect(d6).toBeCloseTo(flightEnvelope(cfg), 4);
    // span 7 (6 intermediates >= gate, > 3 shown) flies
    expect(jumpFrom0(cfg, 7).state.teleportVirtualIndex).not.toBeNull();
  });
});

/**
 * The intent ladder — `intentFromState` — and it is a LADDER, not a set: the
 * order of the checks IS the priority, and several of its conditions are true
 * at once in ordinary rides. A deck mid-teleport is also mid-jump; a snap-back
 * that follows a repeated click carries both flags.
 *
 * Nothing tested the order itself. Every case below puts two conditions on at
 * once and pins WHICH ONE WINS — because reordering the ladder is a one-line
 * edit that no other test in the project notices, and its symptom is a ride
 * built with the wrong shape rather than a crash.
 */

const at = (state: CarouselState, position = 0) => ({
  state,
  config,
  isInstantMode: false,
  start: { position, velocity: 0, strategy: "idle" as const },
  startedAt: 0,
});

const riding = (overrides: Partial<CarouselState>): CarouselState => ({
  ...initialState(makeLayout(12, 3)),
  fromVirtualIndex: 0,
  virtualIndex: 6,
  targetPageIndex: 2,
  motionPhase: "step-normal",
  moveReason: "click",
  ...overrides,
});

describe("intent ladder — which condition wins when several are true", () => {
  // The ladder's first rung — `isInstant` — is deliberately NOT exercised here.
  // The runner returns before the factory whenever instant mode is on
  // (`useMotionRunner`, "the mode, not only the phase"), so no state reaches
  // this file with it set. It stays as a guard; its test lives at the runner,
  // where the decision is actually taken.

  it("a pending teleport outranks the approach flag", () => {
    // Both are on for exactly one frame at the mid-cut. Read the approach
    // first and the preflight is animated with the approach's shape — the
    // deck brakes into a jump it has not started yet.
    const both = riding({
      teleportVirtualIndex: 15,
      isTeleportApproach: true,
      motionPhase: "step-jump",
    });
    const approachOnly = riding({
      isTeleportApproach: true,
      motionPhase: "step-jump",
    });

    const preflight = sampleCarouselSegment(
      buildCarouselSegment(at(both)).segment,
      1,
    );
    const approach = sampleCarouselSegment(
      buildCarouselSegment(at(approachOnly)).segment,
      1,
    );
    // A preflight accelerates from rest; an approach starts already cruising,
    // because its ramp-up happened before the cut.
    expect(Math.abs(preflight.velocity)).toBeLessThan(
      Math.abs(approach.velocity),
    );
  });

  it("the approach outranks a snap-back", () => {
    const state = riding({
      isTeleportApproach: true,
      motionPhase: "step-snap",
    });
    expect(buildCarouselSegment(at(state)).segment.strategy).toBe("jump");
  });

  it("a repeated click outranks the reason the deck is moving", () => {
    // Same command, same reason, one flag apart — and the flag decides whether
    // the ride is built from the click tempo or from the repeat's speed
    // multiplier.
    const plain = riding({});
    const repeated = riding({ isRepeatedClickAdvance: true });

    expect(buildCarouselSegment(at(plain)).segment.strategy).toBe("step");
    expect(buildCarouselSegment(at(repeated)).segment.strategy).toBe(
      "repeated",
    );
  });

  it("a repeat is faster than the step it replaces, never slower", () => {
    // The multiplier is applied, not divided by: the whole point of the repeat
    // is that the deck hurries. Divided, a burst of clicks would crawl.
    const plain = buildCarouselSegment(at(riding({})));
    const repeated = buildCarouselSegment(
      at(riding({ isRepeatedClickAdvance: true })),
    );
    expect(repeated.duration).toBeLessThan(plain.duration);
  });
});

describe("step profile — which shape a step is given", () => {
  const shaped = {
    ...config,
    motion: {
      ...config.motion,
      // Pinned apart on purpose: a snap-back has no ramp, an ordinary step
      // does. Anything else here and the two cannot be told apart at all.
      stepProfile: {
        accelerationDistanceShare: 0.6,
        decelerationDistanceShare: 0.2,
      },
      snapBackProfile: {
        accelerationDistanceShare: 0,
        decelerationDistanceShare: 0.2,
      },
      autoplayProfile: {
        accelerationDistanceShare: 0,
        decelerationDistanceShare: 0.6,
      },
    },
  };

  const launchSpeed = (state: CarouselState) =>
    Math.abs(
      sampleCarouselSegment(
        buildCarouselSegment({ ...at(state), config: shaped }).segment,
        1,
      ).velocity,
    );

  it("a snap-back leaves at speed; an ordinary step ramps up to it", () => {
    // A rubber-band is a correction, not a journey: it must not spend the
    // first third of its distance accelerating.
    const snap = launchSpeed(
      riding({ motionPhase: "step-snap", virtualIndex: 1 }),
    );
    const step = launchSpeed(riding({ virtualIndex: 1 }));
    expect(snap).toBeGreaterThan(step);
  });

  it("an autoplay step is shaped by its own profile, not the click one", () => {
    // Same phase, same distance, different reason — and the reason alone
    // chooses the shape.
    const autoplay = launchSpeed(riding({ moveReason: "autoplay" }));
    const click = launchSpeed(riding({ moveReason: "click" }));
    expect(autoplay).toBeGreaterThan(click);
  });
});
