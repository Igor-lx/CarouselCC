import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../config/buildConfig";
import type { MotionSettings } from "../config";
import {
  resolveGoToApproachDistance,
  resolveGoToApproachDuration,
  resolveGoToFlightDuration,
  resolveGoToPreflightDuration,
  resolveGoToPlan,
  resolveGoToProfileZones,
  resolveJumpPeakSpeed,
  resolveSpeed,
} from "./timing";

const motion: MotionSettings = buildCarouselConfig({}).motion;

describe("resolveSpeed", () => {
  it("is the unsigned distance over duration", () => {
    expect(resolveSpeed(100, 2000)).toBeCloseTo(0.05);
    expect(resolveSpeed(-100, 2000)).toBeCloseTo(0.05);
  });
});

describe("resolveJumpPeakSpeed", () => {
  it("scales the one-step speed by the jump multiplier", () => {
    const stepSize = 3;
    const stepDuration = 2000;
    const oneStep = resolveSpeed(stepSize, stepDuration);
    expect(resolveJumpPeakSpeed(stepSize, stepDuration, 8)).toBeCloseTo(oneStep * 8);
    expect(resolveJumpPeakSpeed(stepSize, stepDuration, 1)).toBeCloseTo(oneStep);
  });
});

describe("resolveGoToProfileZones", () => {
  it("derives local page-screen budgets from the motion settings", () => {
    for (const stepSize of [1, 2, 3, 5, 7]) {
      const zones = resolveGoToProfileZones(stepSize, motion);
      expect(zones.accelerationDistance).toBeCloseTo(
        stepSize * motion.goToAccelerationDistanceShare,
      );
      expect(zones.decelerationDistance).toBeCloseTo(
        stepSize * motion.goToDecelerationDistanceShare,
      );
      expect(zones.preflightDistance).toBe(stepSize * motion.goToPreflightPageSpan);
      expect(zones.approachDistance).toBe(stepSize * motion.goToFinalApproachPageSpan);
    }
  });
});

describe("resolveGoToApproachDistance", () => {
  it("is span-independent — always the final approach page budget", () => {
    const stepSize = 4;
    expect(resolveGoToApproachDistance(stepSize, motion)).toBe(
      resolveGoToProfileZones(stepSize, motion).approachDistance,
    );
  });
});

describe("resolveGoToPlan", () => {
  const stepSize = 3;
  // Defaults: preflight 1, approach 1, min intermediates 3 — the structural
  // floor (preflight + approach + 1) coincides with the knob.
  const preflight = motion.goToPreflightPageSpan;
  const approach = motion.goToFinalApproachPageSpan;
  const minIntermediates = motion.goToTeleportMinPageSpan;
  const smallestFlyingSpan = minIntermediates + 1; // intermediates = span - 1

  it("rides continuously while there is nothing to skip (the 1->4 case)", () => {
    // span 3 = two intermediates; preflight shows one, approach shows the
    // other — teleporting between two pages that are both shown anyway is a
    // pointless blink, so the deck just rides.
    for (let pageSpan = 1; pageSpan < smallestFlyingSpan; pageSpan += 1) {
      const plan = resolveGoToPlan(pageSpan, stepSize, motion);
      expect(plan.isTeleport).toBe(false);
      expect(plan.leadDistance).toBe(pageSpan * stepSize);
      expect(plan.teleportDistance).toBe(0);
      expect(plan.approachDistance).toBe(0);
    }
  });

  it("flies once a full intermediate page can be skipped (the 1->5 case)", () => {
    for (let pageSpan = smallestFlyingSpan; pageSpan <= 20; pageSpan += 1) {
      const plan = resolveGoToPlan(pageSpan, stepSize, motion);
      const realDistance = pageSpan * stepSize;
      expect(plan.isTeleport).toBe(true);
      expect(plan.leadDistance).toBe(preflight * stepSize);
      expect(plan.approachDistance).toBe(approach * stepSize);
      // preflight + teleport + approach must cover the whole real distance.
      expect(plan.leadDistance + plan.teleportDistance + plan.approachDistance).toBe(
        realDistance,
      );
      // …and the teleported width always spans at least one full skipped
      // page plus the boundary step — never a between-neighbours blink.
      expect(plan.teleportDistance).toBeGreaterThanOrEqual(2 * stepSize);
    }
  });

  it("the knob counts INTERMEDIATE pages, endpoints excluded", () => {
    const lastRide = resolveGoToPlan(smallestFlyingSpan - 1, stepSize, motion);
    const firstFlight = resolveGoToPlan(smallestFlyingSpan, stepSize, motion);
    expect(lastRide.isTeleport).toBe(false);
    expect(firstFlight.isTeleport).toBe(true);
  });

  it("a raised knob postpones the flight further", () => {
    const raised: MotionSettings = { ...motion, goToTeleportMinPageSpan: 6 };
    expect(resolveGoToPlan(6, stepSize, raised).isTeleport).toBe(false); // 5 intermediates
    expect(resolveGoToPlan(7, stepSize, raised).isTeleport).toBe(true); // 6 intermediates
  });

  it("a knob below the structural floor never breaks — every such jump rides", () => {
    // With min=2 (or even 1) and preflight+approach=2 no page can be skipped
    // at intermediates=2, so the structural gate dominates: span 3 rides;
    // span 4 (one skippable page) still flies. Diagnostics reports the idle
    // knob separately.
    for (const idleMin of [1, 2]) {
      const lowered: MotionSettings = { ...motion, goToTeleportMinPageSpan: idleMin };
      const ride = resolveGoToPlan(3, stepSize, lowered);
      expect(ride.isTeleport).toBe(false);
      expect(ride.leadDistance).toBe(3 * stepSize);
      expect(resolveGoToPlan(4, stepSize, lowered).isTeleport).toBe(true);
    }
  });

  it("wider preflight/approach push the floor with them", () => {
    // preflight 2 + approach 1: three intermediates are all shown, so even a
    // meets-the-knob jump with intermediates=3 must ride; intermediates=4
    // (span 5) finally skips a page.
    const wide: MotionSettings = {
      ...motion,
      goToPreflightPageSpan: 2,
      goToTeleportMinPageSpan: 3,
    };
    expect(resolveGoToPlan(4, stepSize, wide).isTeleport).toBe(false);
    const flies = resolveGoToPlan(5, stepSize, wide);
    expect(flies.isTeleport).toBe(true);
    expect(flies.leadDistance).toBe(2 * stepSize);
  });
});

describe("goToTeleportEnabled master switch", () => {
  const stepSize = 3;
  it("false short-circuits the plan: even the farthest span rides", () => {
    const off: MotionSettings = { ...motion, goToTeleportEnabled: false };
    const plan = resolveGoToPlan(50, stepSize, off);
    expect(plan.isTeleport).toBe(false);
    expect(plan.leadDistance).toBe(50 * stepSize);
    expect(plan.teleportDistance).toBe(0);
  });

  it("true keeps the gate semantics intact", () => {
    const on: MotionSettings = { ...motion, goToTeleportEnabled: true };
    expect(resolveGoToPlan(50, stepSize, on).isTeleport).toBe(true);
  });
});

describe("resolveGoToFlightDuration (the ride time ceiling)", () => {
  const stepSize = 3;
  const peak = resolveJumpPeakSpeed(stepSize, 1000, motion.goToSpeedMultiplier);

  it("is exactly preflight + approach", () => {
    expect(resolveGoToFlightDuration(stepSize, motion, peak)).toBeCloseTo(
      resolveGoToPreflightDuration(stepSize, motion, peak) +
        resolveGoToApproachDuration(stepSize, motion, peak),
      9,
    );
  });

  it("a running start shortens only the preflight ramp", () => {
    const standing = resolveGoToFlightDuration(stepSize, motion, peak, 0);
    const rolling = resolveGoToFlightDuration(stepSize, motion, peak, peak / 2);
    expect(rolling).toBeLessThan(standing);
    expect(
      resolveGoToApproachDuration(stepSize, motion, peak),
    ).toBeCloseTo(standing - resolveGoToPreflightDuration(stepSize, motion, peak), 9);
  });

  it("degenerate tunings yield 0 — consumers read that as 'no ceiling'", () => {
    expect(resolveGoToFlightDuration(stepSize, motion, 0)).toBe(0);
    const zeroSpans: MotionSettings = {
      ...motion,
      goToPreflightPageSpan: 0,
      goToFinalApproachPageSpan: 0,
    };
    expect(resolveGoToFlightDuration(stepSize, zeroSpans, peak)).toBe(0);
  });
});
