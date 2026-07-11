import { describe, expect, it } from "vitest";

import { resolveReleaseStartedAt } from "./releaseClock";

describe("resolveReleaseStartedAt", () => {
  it("falls back to now when the stamp is unknown or nonsensical", () => {
    expect(resolveReleaseStartedAt(null, 1000, 120)).toBe(1000);
    expect(resolveReleaseStartedAt(Number.NaN, 1000, 120)).toBe(1000);
    expect(resolveReleaseStartedAt(Infinity, 1000, 120)).toBe(1000);
  });

  it("never dates the segment into the future", () => {
    expect(resolveReleaseStartedAt(1500, 1000, 120)).toBe(1000);
    expect(resolveReleaseStartedAt(1000, 1000, 120)).toBe(1000);
  });

  it("backdates a recent lift-off exactly (the commit gap becomes the skip)", () => {
    expect(resolveReleaseStartedAt(950, 1000, 120)).toBe(950);
  });

  it("clamps a pathologically long gap to the cap", () => {
    expect(resolveReleaseStartedAt(500, 1000, 120)).toBe(880);
  });

  it("a zero cap disables backdating entirely", () => {
    expect(resolveReleaseStartedAt(950, 1000, 0)).toBe(1000);
  });
});
