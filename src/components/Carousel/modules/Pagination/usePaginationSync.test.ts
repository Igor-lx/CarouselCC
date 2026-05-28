import { describe, expect, it } from "vitest";

import { resolvePaginationInstantSync } from "./usePaginationSync";

describe("resolvePaginationInstantSync", () => {
  it("syncs instantly for every non-autoplay move", () => {
    expect(resolvePaginationInstantSync("click", false)).toBe(true);
    expect(resolvePaginationInstantSync("gesture", false)).toBe(true);
    expect(resolvePaginationInstantSync(null, false)).toBe(true);
  });

  it("delays the dot for an autoplay move", () => {
    expect(resolvePaginationInstantSync("autoplay", false)).toBe(false);
  });

  it("delays an autoplay move regardless of how it travels (step or loop-back jump)", () => {
    expect(resolvePaginationInstantSync("autoplay", false)).toBe(false);
  });

  it("always syncs instantly under reduced motion", () => {
    expect(resolvePaginationInstantSync("autoplay", true)).toBe(true);
    expect(resolvePaginationInstantSync("click", true)).toBe(true);
  });
});
