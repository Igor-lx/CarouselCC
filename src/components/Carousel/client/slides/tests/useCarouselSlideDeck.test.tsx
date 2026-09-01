// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Slide } from "../../public-api/types";
import { useCarouselSlideDeck } from "../useCarouselSlideDeck";

/**
 * The three memo steps that turn the host's slides into a deck: records,
 * padding to whole pages, layout — plus the diagnostic report about whether
 * the padding happened.
 *
 * The padding is a two-condition decision and neither half was pinned: the
 * host has to have asked for full pages AND the last page has to be ragged.
 * Pad without being asked and the deck grows slides the host never passed,
 * which the diagnostic then reports as the host's own doing; skip the ragged
 * check and a deck that already divides evenly is padded by a whole extra
 * page of blanks.
 */

const slidesOf = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    content: `slide ${i}`,
  }));

interface Input {
  slidesData: Slide[];
  visibleSlidesCount: number;
  isFullPagesOn: boolean;
}

let host: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useCarouselSlideDeck>;

function Probe({ slidesData, visibleSlidesCount, isFullPagesOn }: Input) {
  seen = useCarouselSlideDeck({
    slidesData,
    visibleSlidesCount,
    isFinite: false,
    isFullPagesOn,
  });
  return null;
}

const render = (input: Input) => {
  act(() => {
    root.render(<Probe {...input} />);
  });
  return seen;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("padding the deck to whole pages", () => {
  it("pads a ragged deck when the host asked for it", () => {
    // 7 slides at 3 per page leaves a page of one; the option exists so the
    // last page is not mostly empty space.
    const view = render({
      slidesData: slidesOf(7),
      visibleSlidesCount: 3,
      isFullPagesOn: true,
    });

    expect(view.records.length).toBe(9);
    expect(view.perfectPageLayoutInfo).toMatchObject({
      hasPerfectPageLayout: false,
      rawLength: 7,
      extendedLength: 9,
      didExtendLayout: true,
    });
  });

  it("leaves a ragged deck alone when the host did not ask", () => {
    const view = render({
      slidesData: slidesOf(7),
      visibleSlidesCount: 3,
      isFullPagesOn: false,
    });

    expect(view.records.length).toBe(7);
    expect(view.perfectPageLayoutInfo).toMatchObject({
      // The report is about the DECK, not about the option: the layout is
      // still imperfect, it simply was not fixed.
      hasPerfectPageLayout: false,
      extendedLength: 7,
      didExtendLayout: false,
    });
  });

  it("adds nothing to a deck that already divides evenly", () => {
    // Asked for, but there is nothing ragged to fix. Padding here would append
    // a whole page of duplicates to a deck the host got right.
    const view = render({
      slidesData: slidesOf(9),
      visibleSlidesCount: 3,
      isFullPagesOn: true,
    });

    expect(view.records.length).toBe(9);
    expect(view.perfectPageLayoutInfo).toMatchObject({
      hasPerfectPageLayout: true,
      rawLength: 9,
      extendedLength: 9,
      didExtendLayout: false,
    });
  });

  it("re-decides when the page size changes under the same slides", () => {
    // The same 9 slides are perfect at 3 per page and ragged at 4.
    render({
      slidesData: slidesOf(9),
      visibleSlidesCount: 3,
      isFullPagesOn: true,
    });
    const wider = render({
      slidesData: slidesOf(9),
      visibleSlidesCount: 4,
      isFullPagesOn: true,
    });

    expect(wider.perfectPageLayoutInfo.didExtendLayout).toBe(true);
    expect(wider.records.length).toBe(12);
    expect(wider.layout.visibleSlidesCount).toBe(4);
  });
});
