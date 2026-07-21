// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { VirtualSlide } from "../domain";
import { useCarouselPresentation } from "./useCarouselPresentation";

/**
 * Why this exists: `virtualSlides` is rebuilt whenever `isMoving` flips — at
 * the START and the END of every ride — because the visibility flags depend
 * on it. A slide's LANE does not: it is a function of its own virtualIndex
 * and the layout origin. If the style objects were rebuilt along with the
 * array, every mounted SlideItem would receive a fresh `style` prop and
 * re-render in exactly the two frames where the animation starts and settles
 * — the click-time stutter this guards against.
 */

let host: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useCarouselPresentation> | null = null;

const slide = (virtualIndex: number, isActual: boolean): VirtualSlide =>
  ({
    slideKey: `s-${virtualIndex}`,
    slideData: { id: `s-${virtualIndex}`, content: "x" },
    virtualIndex,
    isActive: false,
    isActual,
    ariaProps: { role: "group" },
  }) as unknown as VirtualSlide;

/** Defined ONCE: a component declared per render would be a new type, so
 * React would remount it and reset the hook's cache — the very thing under
 * test. */
const Probe = ({
  virtualSlides,
  layoutOrigin,
}: {
  virtualSlides: VirtualSlide[];
  layoutOrigin: number;
}) => {
  seen = useCarouselPresentation({
    visibleSlidesCount: 3,
    virtualSlides,
    layoutOrigin,
    flags: {},
  });
  return null;
};

const render = (virtualSlides: VirtualSlide[], layoutOrigin = 0) => {
  act(() =>
    root.render(
      <Probe virtualSlides={virtualSlides} layoutOrigin={layoutOrigin} />,
    ),
  );
  return seen!;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  seen = null;
});

describe("slide lane styles are identity-stable", () => {
  it("a rebuilt slide list with unchanged lanes reuses the SAME style objects", () => {
    const first = render([slide(0, false), slide(1, true), slide(2, false)]);
    const before = [...first.slideStyles];

    // A fresh array of fresh slide objects — exactly what an isMoving flip
    // produces — with the same lanes.
    const second = render([slide(0, true), slide(1, true), slide(2, false)]);

    expect(second.slideStyles[0]).toBe(before[0]);
    expect(second.slideStyles[1]).toBe(before[1]);
    expect(second.slideStyles[2]).toBe(before[2]);
  });

  it("a slide entering the window gets its own object, neighbours keep theirs", () => {
    const first = render([slide(0, false), slide(1, false)]);
    const before = [...first.slideStyles];

    const second = render([slide(0, false), slide(1, false), slide(2, false)]);

    expect(second.slideStyles[0]).toBe(before[0]);
    expect(second.slideStyles[1]).toBe(before[1]);
    expect(second.slideStyles[2]).not.toBe(before[1]);
    expect(second.slideStyles[2]!["--slide-lane"]).not.toBe(
      before[1]!["--slide-lane"],
    );
  });

  it("a layout-origin recenter re-bases every lane (cache dropped)", () => {
    const first = render([slide(5, false), slide(6, false)], 0);
    const before = [...first.slideStyles];

    const second = render([slide(5, false), slide(6, false)], 4);

    expect(second.slideStyles[0]).not.toBe(before[0]);
    expect(second.slideStyles[0]!["--slide-lane"]).not.toBe(
      before[0]!["--slide-lane"],
    );
  });

  it("lanes stay correct after slides leave and re-enter the window", () => {
    render([slide(0, false), slide(1, false), slide(2, false)]);
    render([slide(2, false)]); // window shrank — 0 and 1 pruned
    const back = render([slide(0, false), slide(1, false), slide(2, false)]);

    expect(back.slideStyles.map((style) => style["--slide-lane"])).toEqual([
      0, 1, 2,
    ]);
  });
});
