import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { CarouselLayout } from "../domain";
import type { Slide } from "../contract/types";
import { buildInitialState } from "./initial";
import { reconcileStateToLayout } from "./reconcile";
import type { CarouselState } from "./types";

const makeLayout = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
  idTag = "a",
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `${idTag}-${i}`,
    content: `slide-${idTag}-${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visibleSlidesCount, isFinite);
};

const movedState = (layout: CarouselLayout, targetPageIndex: number): CarouselState => ({
  ...buildInitialState(layout),
  targetPageIndex,
  fromVirtualIndex: 0,
  virtualIndex: targetPageIndex * layout.visibleSlidesCount,
  motionPhase: "step-normal",
  moveReason: "click",
});

describe("reconcileStateToLayout — equivalence fast path", () => {
  it("returns the same state instance when the layout reference is unchanged", () => {
    const layout = makeLayout(12, 3, false);
    const state = buildInitialState(layout);
    expect(reconcileStateToLayout(state, layout)).toBe(state);
  });

  it("swaps only the layout reference when the layout is structurally equal", () => {
    const layout = makeLayout(12, 3, false);
    const equivalent = makeLayout(12, 3, false);
    const state = movedState(layout, 2);
    const next = reconcileStateToLayout(state, equivalent);
    expect(next).not.toBe(state);
    expect(next.layout).toBe(equivalent);
    expect(next.targetPageIndex).toBe(2);
    expect(next.motionPhase).toBe("step-normal");
  });
});

describe("reconcileStateToLayout — hard reset", () => {
  it("resets to the initial state on a dataKey change", () => {
    const layout = makeLayout(12, 3, false, "a");
    const replaced = makeLayout(8, 3, false, "b");
    const next = reconcileStateToLayout(movedState(layout, 3), replaced);
    expect(next).toEqual(buildInitialState(replaced));
    expect(next.motionPhase).toBe("idle");
    expect(next.targetPageIndex).toBe(0);
  });

  it("resets when string content changes under the same ids and length", () => {
    const beforeSlides: Slide[] = [
      { id: "same-1", content: "old-1" },
      { id: "same-2", content: "old-2" },
      { id: "same-3", content: "old-3" },
      { id: "same-4", content: "old-4" },
    ];
    const afterSlides: Slide[] = [
      { id: "same-1", content: "new-1" },
      { id: "same-2", content: "new-2" },
      { id: "same-3", content: "new-3" },
      { id: "same-4", content: "new-4" },
    ];
    const layout = buildCarouselLayout(buildSlideRecords(beforeSlides), 2, false);
    const replaced = buildCarouselLayout(buildSlideRecords(afterSlides), 2, false);
    const next = reconcileStateToLayout(movedState(layout, 1), replaced);

    expect(next).toEqual(buildInitialState(replaced));
  });

  it("resets when numeric content changes under the same ids and length", () => {
    const beforeSlides: Slide[] = [
      { id: "same-1", content: 1 },
      { id: "same-2", content: 2 },
      { id: "same-3", content: 3 },
      { id: "same-4", content: 4 },
    ];
    const afterSlides: Slide[] = [
      { id: "same-1", content: 10 },
      { id: "same-2", content: 20 },
      { id: "same-3", content: 30 },
      { id: "same-4", content: 40 },
    ];
    const layout = buildCarouselLayout(buildSlideRecords(beforeSlides), 2, false);
    const replaced = buildCarouselLayout(buildSlideRecords(afterSlides), 2, false);
    const next = reconcileStateToLayout(movedState(layout, 1), replaced);

    expect(next).toEqual(buildInitialState(replaced));
  });

  it("resets to the initial state on an isFinite change", () => {
    const cyclic = makeLayout(12, 3, false);
    const finite = makeLayout(12, 3, true);
    const next = reconcileStateToLayout(movedState(cyclic, 2), finite);
    expect(next.motionPhase).toBe("idle");
    expect(next.targetPageIndex).toBe(0);
  });
});

describe("reconcileStateToLayout — proportional remap", () => {
  it("maps the page proportionally and collapses motion to an instant snap", () => {
    const before = makeLayout(12, 3, false);
    const after = makeLayout(12, 4, false);
    const next = reconcileStateToLayout(movedState(before, 2), after);
    expect(next.motionPhase).toBe("step-instant");
    expect(next.targetPageIndex).toBeGreaterThanOrEqual(0);
    expect(next.targetPageIndex).toBeLessThan(after.pageCount);
    expect(next.virtualIndex).toBe(next.targetPageIndex * after.visibleSlidesCount);
    expect(next.fromVirtualIndex).toBe(next.virtualIndex);
  });
});

describe("reconcileStateToLayout — idempotency (ADR-001 contract)", () => {
  const cases: Array<[string, CarouselState, CarouselLayout]> = [
    ["same shape", movedState(makeLayout(12, 3, false), 2), makeLayout(12, 4, false)],
    ["hard reset", movedState(makeLayout(12, 3, false), 2), makeLayout(9, 3, true)],
  ];

  for (const [name, state, nextLayout] of cases) {
    it(`is stable on a second reconcile (${name})`, () => {
      const once = reconcileStateToLayout(state, nextLayout);
      const twice = reconcileStateToLayout(once, { ...nextLayout });
      expect(twice.targetPageIndex).toBe(once.targetPageIndex);
      expect(twice.virtualIndex).toBe(once.virtualIndex);
      expect(twice.fromVirtualIndex).toBe(once.fromVirtualIndex);
      expect(twice.motionPhase).toBe(once.motionPhase);
    });
  }
});

describe("reconcileStateToLayout — recovery from a stuck phase", () => {
  it("lifts a dragging state out of the dragging phase when the deck collapses", () => {
    const slidable = makeLayout(12, 3, false);
    const collapsed = makeLayout(12, 20, false);
    expect(collapsed.canSlide).toBe(false);

    const dragging: CarouselState = {
      ...buildInitialState(slidable),
      motionPhase: "dragging",
      moveReason: "gesture",
    };
    const recovered = reconcileStateToLayout(dragging, collapsed);
    expect(recovered.motionPhase).not.toBe("dragging");
    expect(recovered.motionPhase).toBe("step-instant");
  });

  it("hard-resets a dragging state to idle when the deck is replaced", () => {
    const layout = makeLayout(12, 3, false, "a");
    const replaced = makeLayout(10, 3, false, "b");
    const dragging: CarouselState = {
      ...buildInitialState(layout),
      motionPhase: "dragging",
      moveReason: "gesture",
    };
    const recovered = reconcileStateToLayout(dragging, replaced);
    expect(recovered.motionPhase).toBe("idle");
    expect(recovered.targetPageIndex).toBe(0);
    expect(recovered.layout).toBe(replaced);
  });
});
