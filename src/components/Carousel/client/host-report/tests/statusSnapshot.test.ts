import { describe, expect, it } from "vitest";

import type { CarouselStatusSnapshot } from "../../public-api/types";
import { areStatusSnapshotsEqual } from "../statusSnapshot";

/**
 * The comparator is what stops the host callback firing on every render, so its
 * real obligation is COMPLETENESS: every field of the snapshot has to be
 * compared. A field added to `CarouselStatusSnapshot` and forgotten here means
 * the host silently stops hearing about that change — and a hand-written list
 * of "field N differs" cases cannot notice that, because it lists the fields it
 * already knows about.
 *
 * So this walks the snapshot's OWN keys instead.
 */

const BASE: CarouselStatusSnapshot = {
  isIdle: true,
  currentPageIndex: 0,
  pageCount: 5,
  isAtStart: true,
  isAtEnd: false,
};

/** A different value of the right type, whatever the field holds. */
const differentValue = (value: unknown): unknown =>
  typeof value === "boolean" ? !value : (value as number) + 1;

describe("areStatusSnapshotsEqual", () => {
  it("holds for two field-identical snapshots", () => {
    expect(areStatusSnapshotsEqual(BASE, { ...BASE })).toBe(true);
  });

  it("reacts to EVERY field the snapshot declares", () => {
    const keys = Object.keys(BASE) as Array<keyof CarouselStatusSnapshot>;
    // Anti-vacuous: an emptied shape must not make this pass by doing nothing.
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const changed = {
        ...BASE,
        [key]: differentValue(BASE[key]),
      };
      expect(
        areStatusSnapshotsEqual(BASE, changed),
        `"${key}" changed but the comparator reported equal — the host would never hear about it`,
      ).toBe(false);
    }
  });
});
