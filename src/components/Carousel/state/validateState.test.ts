import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { CarouselLayout } from "../domain";
import type { Slide } from "../types";
import { buildInitialState } from "./initial";
import type { CarouselState } from "./types";
import { validateCarouselState } from "./validateState";

const makeLayout = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `slide-${i}`,
    content: `slide-${i}`,
  }));
  return buildCarouselLayout(
    buildSlideRecords(slides),
    visibleSlidesCount,
    isFinite,
  );
};

const validate = (
  overrides: Partial<CarouselState> = {},
  layout = makeLayout(12, 3, false),
) =>
  validateCarouselState({ ...buildInitialState(layout), ...overrides }, layout);

describe("validateCarouselState", () => {
  it("returns no issues for a valid idle state", () => {
    expect(validate()).toEqual([]);
  });

  it("reports an out-of-bounds target page", () => {
    const issues = validate({ targetPageIndex: 4 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "target-page-out-of-bounds",
      field: "targetPageIndex",
      actual: 4,
    });
  });

  it("reports a pending teleport outside jump motion", () => {
    const issues = validate({
      motionPhase: "idle",
      teleportVirtualIndex: 12,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "teleport-target-outside-jump",
      field: "teleportVirtualIndex",
    });
  });

  it("reports teleport approach outside jump motion", () => {
    const issues = validate({
      motionPhase: "idle",
      isTeleportApproach: true,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "teleport-approach-outside-jump",
      field: "isTeleportApproach",
    });
  });
});
