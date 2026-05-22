import { describe, expect, it } from "vitest";

import { buildRawCarouselConfig } from "../config/buildRawConfig";
import type { MotionSettings } from "../config";
import {
  resolveGoToApproachDistance,
  resolveGoToPlan,
  resolveGoToProfileZones,
  resolveJumpPeakSpeed,
  resolveSpeed,
} from "./timing";

const motion: MotionSettings = buildRawCarouselConfig({}).motion;

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
  // preflight = 2 pages, approach = 1 page -> a jump within 3 pages is direct.
  const visibleTeleportSpan = motion.goToPreflightPageSpan + motion.goToFinalApproachPageSpan;

  it("animates the whole distance for a short jump (no teleport)", () => {
    for (let pageSpan = 1; pageSpan <= visibleTeleportSpan; pageSpan += 1) {
      const plan = resolveGoToPlan(pageSpan, stepSize, motion);
      expect(plan.isTeleport).toBe(false);
      expect(plan.leadDistance).toBe(pageSpan * stepSize);
      expect(plan.teleportDistance).toBe(0);
      expect(plan.approachDistance).toBe(0);
    }
  });

  it("splits a far jump into preflight + teleport + approach", () => {
    for (let pageSpan = visibleTeleportSpan + 1; pageSpan <= 20; pageSpan += 1) {
      const plan = resolveGoToPlan(pageSpan, stepSize, motion);
      const realDistance = pageSpan * stepSize;
      expect(plan.isTeleport).toBe(true);
      expect(plan.leadDistance).toBe(motion.goToPreflightPageSpan * stepSize);
      expect(plan.approachDistance).toBe(motion.goToFinalApproachPageSpan * stepSize);
      // preflight + teleport + approach must cover the whole real distance.
      expect(plan.leadDistance + plan.teleportDistance + plan.approachDistance).toBe(
        realDistance,
      );
    }
  });

  it("treats the exact preflight+approach span as the last direct jump", () => {
    const atBoundary = resolveGoToPlan(visibleTeleportSpan, stepSize, motion);
    const justOver = resolveGoToPlan(visibleTeleportSpan + 1, stepSize, motion);
    expect(atBoundary.isTeleport).toBe(false);
    expect(justOver.isTeleport).toBe(true);
  });
});
