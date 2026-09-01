/**
 * FORK of `shared/engines/gesture/tests/inertialRelease.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { describe, expect, it } from "vitest";

import { resolveInertialRelease } from "../inertia/inertialRelease";

const config = { inertiaBoost: 2 };

describe("resolveInertialRelease", () => {
  it("falls back to the base speed when the release is slower than base", () => {
    // base speed = 100 / 1000 = 0.1; release 0.05 does not beat it
    const r = resolveInertialRelease({
      gestureReleaseVelocity: 0.05,
      distanceToTarget: 100,
      baseDuration: 1000,
      config,
    });
    expect(r.isInertialRelease).toBe(false);
    expect(r.effectiveReleaseSpeed).toBeCloseTo(0.1, 10);
  });

  it("boosts a faster-than-base release and marks it inertial", () => {
    const r = resolveInertialRelease({
      gestureReleaseVelocity: 0.5,
      distanceToTarget: 100,
      baseDuration: 1000,
      config,
    });
    expect(r.isInertialRelease).toBe(true);
    expect(r.effectiveReleaseSpeed).toBeCloseTo(1, 10); // 0.5 * boost 2
  });

  it("ignores velocity that opposes the travel direction", () => {
    const r = resolveInertialRelease({
      gestureReleaseVelocity: -0.5,
      distanceToTarget: 100,
      baseDuration: 1000,
      config,
    });
    expect(r.isInertialRelease).toBe(false);
    expect(r.effectiveReleaseSpeed).toBeCloseTo(0.1, 10);
  });

  it("never dips below the base speed even after a weak boost", () => {
    const weak = { inertiaBoost: 0.5 };
    // release 0.12 beats base 0.1, but boosted 0.06 would undershoot it
    const r = resolveInertialRelease({
      gestureReleaseVelocity: 0.12,
      distanceToTarget: 100,
      baseDuration: 1000,
      config: weak,
    });
    expect(r.isInertialRelease).toBe(true);
    expect(r.effectiveReleaseSpeed).toBeCloseTo(0.1, 10);
  });

  it("handles a zero base duration (no minimum): pure boosted release", () => {
    const r = resolveInertialRelease({
      gestureReleaseVelocity: 0.5,
      distanceToTarget: 100,
      baseDuration: 0,
      config,
    });
    expect(r.effectiveReleaseSpeed).toBeCloseTo(1, 10);
  });
  it("a release exactly at the base speed is not a flick", () => {
    // The boundary is what separates "the finger merely kept up with the ride
    // it was already owed" from "the finger asked for more". Read as `>=`, a
    // release that matched the base tempo would be boosted to twice it — a
    // deck that lurches on a gesture the user made no faster than the animation
    // would have gone on its own.
    const r = resolveInertialRelease({
      gestureReleaseVelocity: 0.1, // base = 100 / 1000 = 0.1 exactly
      distanceToTarget: 100,
      baseDuration: 1000,
      config,
    });
    expect(r.isInertialRelease).toBe(false);
    expect(r.effectiveReleaseSpeed).toBeCloseTo(0.1, 10);
  });
});
