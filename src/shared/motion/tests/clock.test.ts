import { describe, expect, it } from "vitest";

import { motionNow } from "../runtime/clock";

describe("motionNow", () => {
  it("returns a finite, non-decreasing timestamp", () => {
    const first = motionNow();
    const second = motionNow();
    expect(Number.isFinite(first)).toBe(true);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
