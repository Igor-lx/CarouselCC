import { describe, expect, it } from "vitest";

import {
  projectMomentum,
  resolveReleaseKinetics,
} from "../inertia/releaseKinetics";

/**
 * The fused release kinetics: one call answers "how fast does this release
 * ride" — flick judgment + continuity launch, so a consumer does not assemble
 * the recipe from the two primitives by hand.
 */
describe("resolveReleaseKinetics", () => {
  const BASE = 0.6; // the consumer's cruise, units/ms

  it("a lazy release rides at the base tempo, launching from its visible speed", () => {
    const k = resolveReleaseKinetics({
      distance: 200,
      launchVelocity: 0.2, // slower than base — not a flick
      baseSpeed: BASE,
    });
    expect(k.isFlick).toBe(false);
    expect(k.cruiseSpeed).toBeCloseTo(BASE, 10);
    expect(k.startSpeed).toBeCloseTo(0.2, 10); // continuity: start where the eye was
  });

  it("a flick boosts the cruise above the base tempo", () => {
    const k = resolveReleaseKinetics({
      distance: 200,
      launchVelocity: 1.2,
      baseSpeed: BASE,
    });
    expect(k.isFlick).toBe(true);
    expect(k.cruiseSpeed).toBeCloseTo(1.2 * 1.45, 10); // boosted release speed
    expect(k.startSpeed).toBeCloseTo(1.2, 10);
  });

  it("judges the flick by the FINGER when both velocities are given", () => {
    const finger = resolveReleaseKinetics({
      distance: 200,
      launchVelocity: 0.2, // resisted UI reads slow…
      pointerReleaseVelocity: 1.5, // …but the finger flicked
      baseSpeed: BASE,
    });
    expect(finger.isFlick).toBe(true);
    // The launch still honours what the EYE saw (never above visible speed).
    expect(finger.startSpeed).toBeCloseTo(0.2, 10);
  });

  it("an opposing release velocity launches from rest at the base tempo", () => {
    const k = resolveReleaseKinetics({
      distance: 200,
      launchVelocity: -1.0, // finger flicked the WRONG way
      baseSpeed: BASE,
    });
    expect(k.isFlick).toBe(false);
    expect(k.startSpeed).toBe(0);
    expect(k.cruiseSpeed).toBeCloseTo(BASE, 10);
  });

  it("honours a mid-flight handoff velocity for the launch", () => {
    const k = resolveReleaseKinetics({
      distance: 200,
      launchVelocity: 0,
      handoffVelocity: 0.4,
      baseSpeed: BASE,
    });
    expect(k.startSpeed).toBeCloseTo(0.4, 10);
  });
});

describe("projectMomentum", () => {
  it("projects the release velocity forward, signed", () => {
    expect(projectMomentum(1.0)).toBeCloseTo(260, 10);
    expect(projectMomentum(-0.5)).toBeCloseTo(-130, 10);
  });

  it("rests below the threshold (micro-twitch protection)", () => {
    expect(projectMomentum(0.01)).toBeNull();
    expect(projectMomentum(0)).toBeNull();
    expect(projectMomentum(Number.NaN)).toBeNull();
  });

  it("is tunable per call", () => {
    expect(projectMomentum(1.0, { momentumMs: 100 })).toBeCloseTo(100, 10);
    expect(projectMomentum(0.2, { minSpeed: 0.3 })).toBeNull();
  });
});
