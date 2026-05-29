import { describe, expect, it } from "vitest";

import { buildCarouselLayout } from "../domain/layout";
import { buildSlideRecords } from "../domain/slides";
import { collectIdlePreloadTargets } from "./useSlideImagePreload";

const records = buildSlideRecords([
  { id: 1, content: "a" },
  { id: 2, content: "b" },
  { id: 3, content: "c" },
  { id: 4, content: "d" },
  { id: 5, content: "e" },
  { id: 6, content: "f" },
]);

const layout = (isFinite: boolean) => buildCarouselLayout(records, 3, isFinite);
const srcs = (targets: ReturnType<typeof collectIdlePreloadTargets>) =>
  targets.map((target) => target.src);

describe("collectIdlePreloadTargets", () => {
  it("returns nothing when the deck cannot slide", () => {
    const tiny = buildCarouselLayout(buildSlideRecords([{ id: 1, content: "a" }]), 3, false);
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

  it("warms the next off-band page nearest-first and excludes the visible band in finite mode", () => {
    expect(
      srcs(collectIdlePreloadTargets({
        records,
        layout: layout(true),
        currentVirtualIndex: 0,
        neighborPageSpan: 1,
        imageSizes: "33vw",
      })),
    ).toEqual(["d", "e", "f"]);
  });

  it("warms the previous page and respects the finite upper bound", () => {
    expect(
      srcs(collectIdlePreloadTargets({
        records,
        layout: layout(true),
        currentVirtualIndex: 3,
        neighborPageSpan: 1,
        imageSizes: "33vw",
      })),
    ).toEqual(["c", "b", "a"]);
  });

  it("wraps cyclically and de-duplicates URLs", () => {
    const urls = srcs(collectIdlePreloadTargets({
      records,
      layout: layout(false),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
      imageSizes: "33vw",
    }));
    expect(new Set(urls)).toEqual(new Set(["d", "e", "f"]));
    expect(urls.length).toBe(new Set(urls).size);
    expect(urls).not.toContain("a");
  });

  it("excludes visible URLs after cyclic index resolution", () => {
    const smallRecords = buildSlideRecords([
      { id: 1, content: "a" },
      { id: 2, content: "b" },
      { id: 3, content: "c" },
      { id: 4, content: "d" },
    ]);
    expect(
      srcs(collectIdlePreloadTargets({
        records: smallRecords,
        layout: buildCarouselLayout(smallRecords, 3, false),
        currentVirtualIndex: 0,
        neighborPageSpan: 2,
        imageSizes: "33vw",
      })),
    ).toEqual(["d"]);
  });

  it("mirrors the matching responsive source descriptor", () => {
    const responsiveRecords = buildSlideRecords([
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
    const [target] = collectIdlePreloadTargets({
      records: responsiveRecords,
      layout: buildCarouselLayout(responsiveRecords, 1, false),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
      imageSizes: "100vw",
      isMediaMatch: () => true,
    });
    expect(target).toEqual({
      key: "b|b-l-480 480w, b-l-720 720w|50vw",
      src: "b",
      srcSet: "b-l-480 480w, b-l-720 720w",
      sizes: "50vw",
    });
  });
});
