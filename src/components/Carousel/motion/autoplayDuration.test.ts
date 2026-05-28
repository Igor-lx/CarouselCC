import { describe, expect, it } from "vitest";

import { buildRawCarouselConfig } from "../config";
import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { Slide } from "../contract/types";
import { buildInitialState } from "../state/initial";
import { resolveAutoplayMotionDuration } from "./autoplayDuration";

const makeLayout = () => {
  const slides: Slide[] = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    content: `slide-${index}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), 3, false);
};

describe("resolveAutoplayMotionDuration", () => {
  it("derives the autoplay step duration during render", () => {
    const layout = makeLayout();
    const config = buildRawCarouselConfig({ durationAutoplay: 1234 });
    const state = {
      ...buildInitialState(layout),
      targetPageIndex: 1,
      fromVirtualIndex: 0,
      virtualIndex: 3,
      motionPhase: "step-normal" as const,
      moveReason: "autoplay" as const,
    };

    expect(
      resolveAutoplayMotionDuration({
        state,
        config,
        isInstantMode: false,
        isDragging: false,
        enabled: true,
      }),
    ).toBe(1234);
  });

  it("does not publish a duration outside active autoplay motion", () => {
    const layout = makeLayout();
    const config = buildRawCarouselConfig({ durationAutoplay: 1234 });

    expect(
      resolveAutoplayMotionDuration({
        state: buildInitialState(layout),
        config,
        isInstantMode: false,
        isDragging: false,
        enabled: true,
      }),
    ).toBe(0);
  });
});
