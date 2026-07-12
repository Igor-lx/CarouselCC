import { describe, expect, it } from "vitest";

import { resolveCoastedLaunchPosition } from "./coast";

const base = {
  livePosition: 0,
  releaseVelocity: 0.002,
  releasedAt: 1000,
  now: 1064,
  maxCoastMs: 250,
  targetVirtualIndex: 3,
};

describe("resolveCoastedLaunchPosition", () => {
  it("extrapolates by velocity x elapsed commit gap toward the target", () => {
    expect(resolveCoastedLaunchPosition(base)).toBeCloseTo(0.128, 10);
  });

  it("clamps AT the target when the extrapolation would cross it", () => {
    expect(
      resolveCoastedLaunchPosition({ ...base, livePosition: 2.999 }),
    ).toBe(3);
  });

  it("launches from the release point on a calm release (zero velocity)", () => {
    expect(resolveCoastedLaunchPosition({ ...base, releaseVelocity: 0 })).toBe(0);
  });

  it("launches from the release point on a snap-back (velocity opposes target)", () => {
    expect(
      resolveCoastedLaunchPosition({ ...base, releaseVelocity: -0.002 }),
    ).toBe(0);
  });

  it("already at the target: stays at the target", () => {
    expect(resolveCoastedLaunchPosition({ ...base, livePosition: 3 })).toBe(3);
  });

  it("clamps the extrapolated interval at maxCoastMs on a stalled commit", () => {
    const stalled = resolveCoastedLaunchPosition({ ...base, now: 1000 + 5000 });
    expect(stalled).toBeCloseTo(0.002 * 250, 10);
  });

  it("a clock skew (now before releasedAt) extrapolates nothing", () => {
    expect(resolveCoastedLaunchPosition({ ...base, now: 990 })).toBe(0);
  });

  it("works in the negative direction symmetrically", () => {
    expect(
      resolveCoastedLaunchPosition({
        ...base,
        releaseVelocity: -0.002,
        targetVirtualIndex: -3,
      }),
    ).toBeCloseTo(-0.128, 10);
  });
});
