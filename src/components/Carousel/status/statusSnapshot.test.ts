import { describe, expect, it } from "vitest";

import type { CarouselStatusSnapshot } from "../types";
import { areStatusSnapshotsEqual } from "./statusSnapshot";

const snapshot = (
  overrides: Partial<CarouselStatusSnapshot> = {},
): CarouselStatusSnapshot => ({
  isIdle: true,
  currentPageIndex: 0,
  pageCount: 5,
  ...overrides,
});

describe("areStatusSnapshotsEqual", () => {
  it("is true for field-identical snapshots", () => {
    expect(areStatusSnapshotsEqual(snapshot(), snapshot())).toBe(true);
  });

  it("is false when the idle flag differs", () => {
    expect(
      areStatusSnapshotsEqual(snapshot(), snapshot({ isIdle: false })),
    ).toBe(false);
  });

  it("is false when the current page differs", () => {
    expect(
      areStatusSnapshotsEqual(snapshot(), snapshot({ currentPageIndex: 2 })),
    ).toBe(false);
  });

  it("is false when the page count differs", () => {
    expect(
      areStatusSnapshotsEqual(snapshot(), snapshot({ pageCount: 4 })),
    ).toBe(false);
  });
});
