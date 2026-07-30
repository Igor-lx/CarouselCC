// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/pinnedAnimation.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { startPinnedAnimation } from "../compositor/pinnedAnimation";

/**
 * The delivery step's contract: a clean `null` for every "engine cannot"
 * case (the caller then runs the JS fallback), a pinned animation otherwise,
 * and a play-pending (unpinned) animation when only the pin is rejected.
 *
 * jsdom has no WAAPI, so `Element.prototype.animate` is installed before the
 * first call — `isWaapiSupported` caches its very first answer per module
 * instance, and this suite needs it to be `true`.
 */

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  animateMock.mockReset();
});

const element = () => document.createElement("div");
const KEYFRAMES = [{ transform: "translateX(0px)" }, { transform: "translateX(10px)" }];
const TIMING = { duration: 500, startedAt: 1234 };

describe("startPinnedAnimation", () => {
  it("starts with fill:both and pins startTime to the segment clock", () => {
    const fake = { startTime: null as number | null };
    animateMock.mockReturnValue(fake);

    const animation = startPinnedAnimation(element(), KEYFRAMES, TIMING);

    expect(animation).toBe(fake);
    expect(animateMock).toHaveBeenCalledWith(KEYFRAMES, {
      duration: 500,
      fill: "both",
    });
    expect(fake.startTime).toBe(1234);
  });

  it("returns null when the engine throws on animate (restrictive engines)", () => {
    animateMock.mockImplementation(() => {
      throw new Error("not allowed");
    });
    expect(startPinnedAnimation(element(), KEYFRAMES, TIMING)).toBeNull();
  });

  it("keeps a play-pending animation when only the startTime pin is rejected", () => {
    const stubborn = {};
    Object.defineProperty(stubborn, "startTime", {
      set() {
        throw new Error("read-only");
      },
    });
    animateMock.mockReturnValue(stubborn);

    expect(startPinnedAnimation(element(), KEYFRAMES, TIMING)).toBe(stubborn);
  });
});
