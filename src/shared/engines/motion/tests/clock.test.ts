import { afterEach, describe, expect, it, vi } from "vitest";

import { motionNow } from "../runtime/clock";

/**
 * `performance.now()` is the platform's job, not ours — asserting that it
 * returns a finite non-decreasing number tests the runtime.
 *
 * What IS ours is the one branch: the fallback for an environment without
 * `performance` (SSR on an old runtime, a restricted worker). Getting it wrong
 * silently switches the whole engine to a second time domain, and every
 * `startedAt` pinned against a WAAPI animation drifts by the process uptime.
 */

const globalRef = globalThis as { performance?: Performance };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motionNow", () => {
  it("reads the high-resolution clock when the platform has one", () => {
    vi.stubGlobal("performance", { now: () => 1234.5 } as Performance);
    expect(motionNow()).toBe(1234.5);
  });

  it("falls back to Date.now() when the platform has no performance object", () => {
    vi.stubGlobal("performance", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    expect(globalRef.performance).toBeUndefined(); // the branch is really taken
    expect(motionNow()).toBe(1_700_000_000_000);

    vi.mocked(Date.now).mockRestore();
  });
});
