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
  isDragging: false,
  enabled: true,
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

  it("returns 0 when disabled", () => {
    expect(
      resolveAutoplayMotionDuration({
        ...base,
        enabled: false,
        state: autoplayStep(),
      }),
    ).toBe(0);
  });

  it("returns 0 for a degenerate zero-distance step", () => {
    const state: CarouselState = { ...autoplayStep(), virtualIndex: 0 };
    expect(resolveAutoplayMotionDuration({ ...base, state })).toBe(0);
  });
});
