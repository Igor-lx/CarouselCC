// @vitest-environment node

/**
 * FORK of `shared/engines/motion/tests/waapiSupport.test.ts`, byte-identical
 * apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The capability gate in front of the whole compositor path — and the one
 * check in this shelf that reads the environment rather than the arguments.
 *
 * It has three jobs, and every one of them is invisible in the suites that
 * use it: those run in jsdom with `Element.prototype.animate` installed, so
 * the gate is simply always open. Here the environment is node, where the
 * DOM does not exist at all — which is also where this shelf lands when a
 * consumer renders on a server.
 *
 * The answer is cached for the life of the module by design: it gates the
 * choice between the compositor and the JS loop, and a gate that flips
 * mid-session would hand one ride to WAAPI and the next to the frame loop
 * for no reason the user can see.
 */

/** A fresh module instance — the cached answer is per module, not per call. */
const freshGate = async () => {
  vi.resetModules();
  return (await import("../profile/progressCurve")).isWaapiSupported;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isWaapiSupported", () => {
  it("says no where there is no DOM at all", async () => {
    // Server rendering: touching `Element` here is a ReferenceError, not a
    // falsy read, so the check has to be `typeof` and it has to come first.
    expect(typeof Element).toBe("undefined");
    const isWaapiSupported = await freshGate();
    expect(isWaapiSupported()).toBe(false);
  });

  it("says no where the DOM exists but cannot animate", async () => {
    // An engine with elements and no Web Animations API. Assume `animate` is
    // there and every ride calls a function that does not exist.
    vi.stubGlobal("Element", class FakeElement {});
    const isWaapiSupported = await freshGate();
    expect(isWaapiSupported()).toBe(false);
  });

  it("says yes where the DOM can animate", async () => {
    vi.stubGlobal(
      "Element",
      class FakeElement {
        animate() {
          return null;
        }
      },
    );
    const isWaapiSupported = await freshGate();
    expect(isWaapiSupported()).toBe(true);
  });

  it("keeps its first answer for the life of the module", async () => {
    vi.stubGlobal(
      "Element",
      class FakeElement {
        animate() {
          return null;
        }
      },
    );
    const isWaapiSupported = await freshGate();
    expect(isWaapiSupported()).toBe(true);

    vi.unstubAllGlobals();
    expect(typeof Element).toBe("undefined");
    // Same module, same answer: the transport a ride is handed to must not
    // change under it between one ride and the next.
    expect(isWaapiSupported()).toBe(true);
  });
});

describe("startPinnedAnimation — no DOM to pin to", () => {
  it("returns null so the caller runs the JS loop", async () => {
    vi.resetModules();
    const { startPinnedAnimation } =
      await import("../compositor/pinnedAnimation");
    const animation = startPinnedAnimation({} as Element, [], {
      duration: 100,
      startedAt: 0,
    });
    // Not a throw: the shelf is imported on the server too, and a ride that
    // cannot be composited is a ride the frame loop paints.
    expect(animation).toBeNull();
  });
});
