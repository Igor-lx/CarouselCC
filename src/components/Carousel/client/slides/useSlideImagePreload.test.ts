import { describe, expect, it } from "vitest";

import { buildCarouselLayout } from "../domain/layout";
import { buildSlideRecords } from "../domain/slides";
import {
  collectIdlePreloadTargets,
  type SlideImagePreloadTarget,
} from "./useSlideImagePreload";

const records = buildSlideRecords([
  { id: 1, content: "a" },
  { id: 2, content: "b" },
  { id: 3, content: "c" },
  { id: 4, content: "d" },
  { id: 5, content: "e" },
  { id: 6, content: "f" },
]);

const layout = (isFinite: boolean) => buildCarouselLayout(records, 3, isFinite);
const srcsOf = (targets: SlideImagePreloadTarget[]) =>
  targets.map((target) => target.src);

describe("collectIdlePreloadTargets", () => {
  it("returns nothing when the deck cannot slide", () => {
    const tiny = buildCarouselLayout(
      buildSlideRecords([{ id: 1, content: "a" }]),
      3,
      false,
    );
    expect(
      collectIdlePreloadTargets({
        records,
        layout: tiny,
        currentVirtualIndex: 0,
        neighborPageSpan: 1,
        imageSizes: "33vw",
      }),
    ).toEqual([]);
  });

  it("warms the next off-band page nearest-first and excludes the visible band (finite)", () => {
    const targets = collectIdlePreloadTargets({
      records,
      layout: layout(true),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
      imageSizes: "33vw",
    });
    // visible band is a/b/c; the next page d/e/f is warmed, nearest-first.
    expect(srcsOf(targets)).toEqual(["d", "e", "f"]);
  });

  it("warms the previous page and respects the finite upper bound", () => {
    const targets = collectIdlePreloadTargets({
      records,
      layout: layout(true),
      currentVirtualIndex: 3,
      neighborPageSpan: 1,
      imageSizes: "33vw",
    });
    // band d/e/f; left neighbour page c/b/a (nearest-first); no wrap past the end.
    expect(srcsOf(targets)).toEqual(["c", "b", "a"]);
  });

  it("wraps cyclically and never excludes via bounds, with de-duplicated URLs", () => {
    const urls = srcsOf(
      collectIdlePreloadTargets({
        records,
        layout: layout(false),
        currentVirtualIndex: 0,
        neighborPageSpan: 1,
        imageSizes: "33vw",
      }),
    );
    expect(new Set(urls)).toEqual(new Set(["d", "e", "f"]));
    expect(urls.length).toBe(new Set(urls).size); // no duplicates
    expect(urls).not.toContain("a"); // visible band excluded
  });

  it("excludes visible URLs even when a wide span wraps onto them (small looped deck)", () => {
    // 4 records, visible 3, span 2: the off-band window spans more than the
    // deck, so cyclic wrap reaches the visible records a/b/c. Only the single
    // genuinely off-band record (d) must be warmed.
    const smallRecords = buildSlideRecords([
      { id: 1, content: "a" },
      { id: 2, content: "b" },
      { id: 3, content: "c" },
      { id: 4, content: "d" },
    ]);
    expect(
      srcsOf(
        collectIdlePreloadTargets({
          records: smallRecords,
          layout: buildCarouselLayout(smallRecords, 3, false),
          currentVirtualIndex: 0,
          neighborPageSpan: 2,
          imageSizes: "33vw",
        }),
      ),
    ).toEqual(["d"]);
  });

  it("mirrors the default srcSet and carousel sizes onto the descriptor", () => {
    // Finite, visible=1 at index 0: the single off-band neighbour is index 1.
    const responsive = buildSlideRecords([
      { id: 1, content: "a" },
      { id: 2, content: "b", image: { srcSet: "b-480 480w, b-720 720w" } },
    ]);
    const [target] = collectIdlePreloadTargets({
      records: responsive,
      layout: buildCarouselLayout(responsive, 1, true),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
      imageSizes: "33vw",
    });
    // b carries a default srcSet but no sources, so its descriptor mirrors that
    // srcSet and the carousel's default sizes (no `<source>` match consulted).
    expect(target).toEqual({
      key: "b|b-480 480w, b-720 720w|33vw",
      src: "b",
      srcSet: "b-480 480w, b-720 720w",
      sizes: "33vw",
    });
  });

  it("picks the matching <source> descriptor (orientation crop) over the default", () => {
    const responsive = buildSlideRecords([
      {
        id: 1,
        content: "a",
        image: {
          srcSet: "a-480 480w, a-720 720w",
          sources: [
            {
              media: "(orientation: landscape)",
              srcSet: "a-l-480 480w, a-l-720 720w",
              sizes: "50vw",
            },
          ],
        },
      },
      {
        id: 2,
        content: "b",
        image: {
          srcSet: "b-480 480w, b-720 720w",
          sources: [
            {
              media: "(orientation: landscape)",
              srcSet: "b-l-480 480w, b-l-720 720w",
              sizes: "50vw",
            },
          ],
        },
      },
    ]);
    const [landscape] = collectIdlePreloadTargets({
      records: responsive,
      layout: buildCarouselLayout(responsive, 1, false),
      currentVirtualIndex: 0, // visible = a; off-band = b
      neighborPageSpan: 1,
      imageSizes: "100vw",
      isMediaMatch: () => true, // landscape source matches
    });
    expect(landscape).toEqual({
      key: "b|b-l-480 480w, b-l-720 720w|50vw",
      src: "b",
      srcSet: "b-l-480 480w, b-l-720 720w",
      sizes: "50vw",
    });

    const [portrait] = collectIdlePreloadTargets({
      records: responsive,
      layout: buildCarouselLayout(responsive, 1, false),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
      imageSizes: "100vw",
      isMediaMatch: () => false, // no source matches → default srcSet
    });
    expect(portrait).toEqual({
      key: "b|b-480 480w, b-720 720w|100vw",
      src: "b",
      srcSet: "b-480 480w, b-720 720w",
      sizes: "100vw",
    });
  });
});
