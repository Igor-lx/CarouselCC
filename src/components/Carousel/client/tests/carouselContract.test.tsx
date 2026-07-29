// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createRef, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import Carousel from "../Carousel";
import type {
  CarouselHandle,
  CarouselProps,
  CarouselStatusSnapshot,
  Slide,
} from "../public-api/types";
import { Controls } from "../modules/Controls";
import { Pagination } from "../modules/Pagination";
import { installCarouselBrowserEnv } from "./browserEnv";

/**
 * The component's promise to its host, checked by mounting the real thing.
 *
 * Everything else in this suite tests a hook or a pure function in isolation;
 * nothing checked that the twenty of them are WIRED to each other. A prop lost
 * on the way down, a slot gated on the wrong flag, or a handle pointing at a
 * stale callback all pass every other file in the project.
 *
 * Deliberately not asserted here: pixel geometry (jsdom has no layout, and the
 * measured-slot path is covered in geometry/tests) and motion timing (covered
 * against the controller directly). This file is about wiring and contract.
 */

const slides = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    content: `slide ${i}`,
  }));

let host: HTMLDivElement;
let root: Root;

const render = (props: Partial<CarouselProps> = {}) => {
  act(() => {
    root.render(
      <Carousel
        slidesData={slides(12)}
        visibleSlidesNr={3}
        isContentImg={false}
        isAutoplayOn={false}
        {...props}
      />,
    );
  });
};

const slideNodes = () =>
  Array.from(host.querySelectorAll("[data-active-zone]"));
const activeBand = () =>
  Array.from(host.querySelectorAll('[data-active-zone="true"]'));
const textOf = (nodes: Element[]) => nodes.map((n) => n.textContent);

beforeEach(() => {
  installCarouselBrowserEnv();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("<Carousel> — what the host is promised", () => {
  it("puts exactly visibleSlidesNr slides in the active band", () => {
    render({ visibleSlidesNr: 3 });
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1", "slide 2"]);
  });

  it("follows a change of page size without remounting the deck", () => {
    render({ visibleSlidesNr: 3 });
    render({ visibleSlidesNr: 2 });
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1"]);
  });

  it("coerces a page size larger than the deck instead of rendering blanks", () => {
    render({ slidesData: slides(2), visibleSlidesNr: 5 });
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1"]);
  });

  it("renders nothing at all for an empty deck, and does not throw", () => {
    render({ slidesData: [] });
    expect(slideNodes()).toHaveLength(0);
  });

  it("announces itself as a carousel region with per-slide labels", () => {
    render();
    const region = host.querySelector('[data-carousel-root=""]')!;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");

    const first = activeBand()[0]!;
    expect(first.getAttribute("aria-roledescription")).toBe("slide");
    expect(first.getAttribute("aria-label")).toBe("1 of 12");
  });

  it("marks only the on-screen band as current, and inerts the rest", () => {
    render();
    for (const node of activeBand()) {
      expect(node.getAttribute("aria-current")).toBe("step");
      expect(node.hasAttribute("inert")).toBe(false);
    }
    const offBand = slideNodes().filter(
      (n) => n.getAttribute("data-active-zone") === "false",
    );
    expect(offBand.length).toBeGreaterThan(0); // the buffer really is mounted
    for (const node of offBand) {
      expect(node.getAttribute("aria-current")).toBeNull();
      expect(node.hasAttribute("inert")).toBe(true);
    }
  });
});

describe("<Carousel> — the imperative handle", () => {
  it("steps a whole page forward and back", () => {
    const ref = createRef<CarouselHandle>();
    render({ ref });

    act(() => ref.current!.next());
    expect(textOf(activeBand())).toEqual(["slide 3", "slide 4", "slide 5"]);

    act(() => ref.current!.prev());
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1", "slide 2"]);
  });

  /**
   * A burst of clicks does NOT advance one page each. The deck deliberately
   * refuses to run more than `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES` ahead of
   * what the eye can see, and nothing animates here, so the visible position
   * stays put and every further click resolves to the same capped target.
   * That cap is the contract worth pinning at this level.
   */
  it("never runs further ahead of the visible deck than the look-ahead allows", () => {
    const ref = createRef<CarouselHandle>();
    render({ ref, isFinite: false });

    for (let i = 0; i < 8; i += 1) act(() => ref.current!.next());
    // Page 2 of 4 — two pages past the page still on screen, and no further.
    expect(textOf(activeBand())).toEqual(["slide 6", "slide 7", "slide 8"]);
  });

  it("stops at the ends on a finite deck instead of wrapping", () => {
    const ref = createRef<CarouselHandle>();
    // Two pages, so one step reaches the last one and the cap never bites.
    render({ ref, isFinite: true, visibleSlidesNr: 6 });

    act(() => ref.current!.prev()); // already home
    expect(textOf(activeBand())[0]).toBe("slide 0");

    act(() => ref.current!.next());
    expect(textOf(activeBand())[0]).toBe("slide 6");

    act(() => ref.current!.next()); // nowhere left to go
    expect(textOf(activeBand())[0]).toBe("slide 6");
  });

  it("does nothing when the deck is too short to slide", () => {
    const ref = createRef<CarouselHandle>();
    render({ ref, slidesData: slides(2), visibleSlidesNr: 3 });
    act(() => ref.current!.next());
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1"]);
  });
});

describe("<Carousel> — onCarouselStatusChange", () => {
  const lastSnapshot = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls.at(-1)![0] as CarouselStatusSnapshot;

  it("reports the deck's shape on mount", () => {
    const onCarouselStatusChange = vi.fn();
    render({ onCarouselStatusChange });

    expect(onCarouselStatusChange).toHaveBeenCalled();
    expect(lastSnapshot(onCarouselStatusChange)).toMatchObject({
      currentPageIndex: 0,
      pageCount: 4,
      isIdle: true,
    });
  });

  it("reports the new page after a step", () => {
    const onCarouselStatusChange = vi.fn();
    const ref = createRef<CarouselHandle>();
    render({ onCarouselStatusChange, ref });

    act(() => ref.current!.next());
    expect(lastSnapshot(onCarouselStatusChange).currentPageIndex).toBe(1);
  });

  it("never repeats an identical snapshot", () => {
    const onCarouselStatusChange = vi.fn();
    render({ onCarouselStatusChange });
    const afterMount = onCarouselStatusChange.mock.calls.length;

    // Re-render with the same everything: nothing about the status moved.
    render({ onCarouselStatusChange });
    expect(onCarouselStatusChange).toHaveBeenCalledTimes(afterMount);
  });

  it("flags the boundaries on a finite deck and never on a cyclic one", () => {
    const finite = vi.fn();
    render({ onCarouselStatusChange: finite, isFinite: true });
    expect(lastSnapshot(finite)).toMatchObject({
      isAtStart: true,
      isAtEnd: false,
    });

    const cyclic = vi.fn();
    render({ onCarouselStatusChange: cyclic, isFinite: false });
    expect(lastSnapshot(cyclic)).toMatchObject({
      isAtStart: false,
      isAtEnd: false,
    });
  });
});

describe("<Carousel> — slots", () => {
  const hasPagination = () =>
    host.querySelector('[class*="paginationWrapper"]') !== null;
  const navZones = () => host.querySelectorAll("button[aria-label$='slide']");

  it("renders a slot only when the child is passed AND its flag is on", () => {
    render({ children: <Pagination />, isPaginationOn: true });
    expect(hasPagination()).toBe(true);

    render({ children: <Pagination />, isPaginationOn: false });
    expect(hasPagination()).toBe(false);

    render({ isPaginationOn: true });
    expect(hasPagination()).toBe(false);
  });

  it("silences every optional slot when the deck cannot slide", () => {
    render({
      slidesData: slides(2),
      visibleSlidesNr: 3,
      children: (
        <>
          <Pagination />
          <Controls />
        </>
      ),
    });
    expect(hasPagination()).toBe(false);
    expect(navZones()).toHaveLength(0);
  });

  it("hides the arrow at whichever end a finite deck is resting on", () => {
    const labels = () =>
      Array.from(navZones()).map((b) => b.getAttribute("aria-label"));
    const ref = createRef<CarouselHandle>();
    // Two pages: one step is the whole journey.
    render({ ref, isFinite: true, visibleSlidesNr: 6, children: <Controls /> });

    expect(labels()).toEqual(["Next slide"]);
    act(() => ref.current!.next());
    expect(labels()).toEqual(["Previous slide"]);
  });

  it("shows both arrows on a cyclic deck, which has no ends", () => {
    render({ isFinite: false, children: <Controls /> });
    expect(navZones()).toHaveLength(2);
  });

  it("ignores an unknown child instead of rendering it into the deck", () => {
    render({ children: <div data-stray="">stray</div> });
    expect(host.querySelector("[data-stray]")).toBeNull();
  });
});

describe("<Carousel> — props and defaults", () => {
  it("applies the documented default when a prop is omitted", () => {
    // isFinite defaults to false (cyclic), so neither boundary is ever set.
    const onCarouselStatusChange = vi.fn();
    render({ onCarouselStatusChange });
    expect(
      (onCarouselStatusChange.mock.calls.at(-1)![0] as CarouselStatusSnapshot)
        .isAtStart,
    ).toBe(false);
  });

  it("an explicitly passed value wins over the default", () => {
    const onCarouselStatusChange = vi.fn();
    render({ onCarouselStatusChange, isFinite: true });
    expect(
      (onCarouselStatusChange.mock.calls.at(-1)![0] as CarouselStatusSnapshot)
        .isAtStart,
    ).toBe(true);
  });

  it("puts a host className onto the element the map names", () => {
    // Only the host half is observable here: vitest does not materialise CSS
    // module class names, so the component's own side of the merge is an empty
    // string in this environment. The merge ITSELF (both halves, no mutation)
    // is covered in shared/styles/tests/mergeStyleMaps.test.ts.
    render({ className: { slide: "host-slide" } });
    expect(activeBand()[0]!.className).toContain("host-slide");
  });

  it("calls onSlideClick with the clicked slide, and only when interactive", () => {
    const onSlideClick = vi.fn();
    render({ onSlideClick, isSlideInteractiveOn: true });
    (activeBand()[1] as HTMLElement).click();
    expect(onSlideClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1" }),
    );

    onSlideClick.mockClear();
    render({ onSlideClick, isSlideInteractiveOn: false });
    (activeBand()[1] as HTMLElement).click();
    expect(onSlideClick).not.toHaveBeenCalled();
  });

  it("survives StrictMode's double mount", () => {
    act(() => {
      root.render(
        <StrictMode>
          <Carousel
            slidesData={slides(12)}
            visibleSlidesNr={3}
            isContentImg={false}
            isAutoplayOn={false}
          />
        </StrictMode>,
      );
    });
    expect(textOf(activeBand())).toEqual(["slide 0", "slide 1", "slide 2"]);
  });
});
