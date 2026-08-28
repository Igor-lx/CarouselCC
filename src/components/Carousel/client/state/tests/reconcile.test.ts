import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { CarouselLayout } from "../../domain";
import type { Slide } from "../../public-api/types";
import { buildInitialState } from "../initial";
import { reconcileStateToLayout } from "../reconcile";
import type { CarouselState } from "../types";
import { makeLayout } from "./layoutBuilder";

/** A non-idle state to prove reconciliation collapses motion to a snap. */
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
    const before = makeLayout(12, 3, false); // pageCount 4
    const after = makeLayout(12, 4, false); // same deck, pageCount 3
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

describe("reconcileStateToLayout — render-only image variants do not affect identity", () => {
  // The position-preservation guarantee for orientation changes: a slide's
  // `image` (responsive srcSet / sources) is render-only and must never enter
  // `dataKey`, so swapping it on slides with the same id/content keeps the same
  // layout identity and never hard-resets the viewing position.
  const contentOf = (index: number) => `slide-${index}`;
  const baseSlides: Slide[] = Array.from({ length: 12 }, (_, i) => ({
    id: `s-${i}`,
    content: contentOf(i),
  }));
  const withVariants: Slide[] = baseSlides.map((slide, i) => ({
    ...slide,
    image: {
      srcSet: `${contentOf(i)}-480 480w, ${contentOf(i)}-720 720w`,
      sources: [
        {
          media: "(orientation: landscape)",
          srcSet: `${contentOf(i)}-l-480 480w`,
          sizes: "50vw",
        },
      ],
    },
  }));

  it("produces an identical dataKey when only image variants differ", () => {
    const plain = buildCarouselLayout(buildSlideRecords(baseSlides), 3, false);
    const responsive = buildCarouselLayout(buildSlideRecords(withVariants), 3, false);
    expect(responsive.dataKey).toBe(plain.dataKey);
  });

  it("keeps the viewing position (no hard reset) when image variants are added", () => {
    const plain = buildCarouselLayout(buildSlideRecords(baseSlides), 3, false);
    const responsive = buildCarouselLayout(buildSlideRecords(withVariants), 3, false);
    const next = reconcileStateToLayout(movedState(plain, 2), responsive);
    // Same-shape fast path: position preserved, motion not collapsed to a snap.
    expect(next.targetPageIndex).toBe(2);
    expect(next.motionPhase).toBe("step-normal");
  });
});

describe("reconcileStateToLayout — recovery from a stuck phase", () => {
  it("lifts a dragging state out of the dragging phase when the deck collapses", () => {
    const slidable = makeLayout(12, 3, false); // canSlide
    const collapsed = makeLayout(12, 20, false); // visible >= length -> !canSlide
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
