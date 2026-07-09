import { describe, expect, it } from "vitest";

import { buildRawCarouselConfig } from "../config";
import { buildCarouselLayout } from "../domain/layout";
import { buildSlideRecords } from "../domain/slides";
import { buildInitialState } from "../state/initial";
import type { CarouselState } from "../state";
import { resolveAutoplayMotionDuration } from "./autoplayDuration";

const config = buildRawCarouselConfig({});
const layout = buildCarouselLayout(
  buildSlideRecords([
    { id: 1, content: "a" },
    { id: 2, content: "b" },
    { id: 3, content: "c" },
    { id: 4, content: "d" },
    { id: 5, content: "e" },
    { id: 6, content: "f" },
  ]),
  3,
  false,
);

const autoplayStep = (): CarouselState => ({
  ...buildInitialState(layout),
  fromVirtualIndex: 0,
  virtualIndex: layout.visibleSlidesCount, // one page advanced
  motionPhase: "step-normal",
  moveReason: "autoplay",
});

const base = {
  config,
  isInstantMode: false,
};

describe("resolveAutoplayMotionDuration", () => {
  it("publishes the autoplay step duration for an in-flight autoplay step", () => {
    expect(resolveAutoplayMotionDuration({ ...base, state: autoplayStep() })).toBe(
      config.autoplayDuration,
    );
  });

  it("returns 0 for a non-autoplay move", () => {
    const state: CarouselState = { ...autoplayStep(), moveReason: "click" };
    expect(resolveAutoplayMotionDuration({ ...base, state })).toBe(0);
  });

  it("returns 0 while idle", () => {
    const state: CarouselState = {
      ...autoplayStep(),
      motionPhase: "idle",
    };
    expect(resolveAutoplayMotionDuration({ ...base, state })).toBe(0);
  });

  it("returns 0 when the deck cannot slide", () => {
    // The gate is state-derived (state.layout.canSlide), not a separate flag:
    // a deck whose length fits the viewport publishes no autoplay duration.
    const staticLayout = buildCarouselLayout(
      buildSlideRecords([
        { id: 1, content: "a" },
        { id: 2, content: "b" },
        { id: 3, content: "c" },
      ]),
      3,
      false,
    );
    expect(staticLayout.canSlide).toBe(false);
    const state: CarouselState = {
      ...autoplayStep(),
      layout: staticLayout,
    };
    expect(resolveAutoplayMotionDuration({ ...base, state })).toBe(0);
  });

  it("returns 0 for a degenerate zero-distance step", () => {
    const state: CarouselState = { ...autoplayStep(), virtualIndex: 0 };
    expect(resolveAutoplayMotionDuration({ ...base, state })).toBe(0);
  });
});
