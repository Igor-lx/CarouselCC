import { describe, expect, it } from "vitest";

import { buildCarouselLayout } from "../domain/layout";
import { buildSlideRecords } from "../domain/slides";
import { collectIdlePreloadUrls } from "./useSlideImagePreload";

const records = buildSlideRecords([
  { id: 1, content: "a" },
  { id: 2, content: "b" },
  { id: 3, content: "c" },
  { id: 4, content: "d" },
  { id: 5, content: "e" },
  { id: 6, content: "f" },
]);

const layout = (isFinite: boolean) => buildCarouselLayout(records, 3, isFinite);

describe("collectIdlePreloadUrls", () => {
  it("returns nothing when the deck cannot slide", () => {
    const tiny = buildCarouselLayout(buildSlideRecords([{ id: 1, content: "a" }]), 3, false);
    expect(
      collectIdlePreloadUrls({
        records,
        layout: tiny,
        currentVirtualIndex: 0,
        neighborPageSpan: 1,
      }),
    ).toEqual([]);
  });

  it("warms the next off-band page nearest-first and excludes the visible band (finite)", () => {
    const urls = collectIdlePreloadUrls({
      records,
      layout: layout(true),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
    });
    // visible band is a/b/c; the next page d/e/f is warmed, nearest-first.
    expect(urls).toEqual(["d", "e", "f"]);
  });

  it("warms the previous page and respects the finite upper bound", () => {
    const urls = collectIdlePreloadUrls({
      records,
      layout: layout(true),
      currentVirtualIndex: 3,
      neighborPageSpan: 1,
    });
    // band d/e/f; left neighbour page c/b/a (nearest-first); no wrap past the end.
    expect(urls).toEqual(["c", "b", "a"]);
  });

  it("wraps cyclically and never excludes via bounds, with de-duplicated URLs", () => {
    const urls = collectIdlePreloadUrls({
      records,
      layout: layout(false),
      currentVirtualIndex: 0,
      neighborPageSpan: 1,
    });
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
    const urls = collectIdlePreloadUrls({
      records: smallRecords,
      layout: buildCarouselLayout(smallRecords, 3, false),
      currentVirtualIndex: 0,
      neighborPageSpan: 2,
    });
    expect(urls).toEqual(["d"]);
    expect(urls).not.toContain("a");
    expect(urls).not.toContain("b");
    expect(urls).not.toContain("c");
  });
});
