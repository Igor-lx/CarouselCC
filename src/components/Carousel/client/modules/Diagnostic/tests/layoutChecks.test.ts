import { describe, expect, it } from "vitest";

import type { CarouselDiagnosticContextValue } from "../../../context";
import {
  collectLayoutWarnings,
  collectSlotWarnings,
} from "../checks/layoutChecks";

/**
 * Diagnostics is a developer's smoke alarm, and an alarm has exactly two ways
 * to fail: staying silent while the house burns, and going off while nothing
 * does. The second is worse here — a wiring warning nobody can act on trains
 * the reader to ignore the channel, and the real warnings go with it.
 *
 * So each check is asserted BOTH ways: it fires on the misconfiguration it
 * names, and it stays quiet on every healthy shape.
 */

type Slots = CarouselDiagnosticContextValue["slots"];
type Layout = CarouselDiagnosticContextValue["layout"];

const HEALTHY_SLOTS: Slots = {
  isControlsOn: true,
  hasControlsSlot: true,
  isPaginationOn: true,
  hasPaginationSlot: true,
  isPaginationInteractiveOn: true,
  hasResponsiveImagesSlot: true,
  deckCarriesImageSets: true,
};

const HEALTHY_LAYOUT: Layout = {
  rawLength: 12,
  requestedVisibleSlidesCount: 3,
  visibleSlidesCount: 3,
  extendedLength: 12,
  didExtendLayout: false,
  hasPerfectPageLayout: true,
  canSlide: true,
};

const slots = (overrides: Partial<Slots> = {}) =>
  collectSlotWarnings({ ...HEALTHY_SLOTS, ...overrides });
const layout = (overrides: Partial<Layout> = {}) =>
  collectLayoutWarnings({ ...HEALTHY_LAYOUT, ...overrides });

const fields = (warnings: { field: string }[]) => warnings.map((w) => w.field);

describe("collectSlotWarnings", () => {
  it("says nothing about a correctly wired carousel", () => {
    expect(slots()).toEqual([]);
  });

  it("flags a module switched on with no child to render", () => {
    expect(fields(slots({ hasControlsSlot: false }))).toEqual(["isControlsOn"]);
    expect(fields(slots({ hasPaginationSlot: false }))).toContain(
      "isPaginationOn",
    );
  });

  it("says nothing when the module is switched OFF and its child absent", () => {
    expect(slots({ isControlsOn: false, hasControlsSlot: false })).toEqual([]);
  });

  it("flags responsive variants the deck cannot use", () => {
    // Slides carry srcSet/sources but the module that selects them is absent.
    expect(fields(slots({ hasResponsiveImagesSlot: false }))).toEqual([
      "ResponsiveImages",
    ]);
  });

  it("flags the module mounted over a deck with nothing to select from", () => {
    expect(fields(slots({ deckCarriesImageSets: false }))).toEqual([
      "ResponsiveImages",
    ]);
  });

  it("says nothing when neither the variants nor the module are present", () => {
    expect(
      slots({ deckCarriesImageSets: false, hasResponsiveImagesSlot: false }),
    ).toEqual([]);
  });

  it("flags a flag that decides nothing", () => {
    // Clickable dots, with pagination off: there are no dots to click.
    expect(
      fields(slots({ isPaginationOn: false, hasPaginationSlot: false })),
    ).toEqual(["isPaginationInteractiveOn"]);
  });

  it("reports every independent mistake, not just the first", () => {
    const out = slots({ hasControlsSlot: false, hasPaginationSlot: false });
    expect(out.length).toBeGreaterThan(1);
  });
});

describe("collectLayoutWarnings", () => {
  it("says nothing about a deck that divides evenly and can slide", () => {
    expect(layout()).toEqual([]);
  });

  it("flags a visible band wider than the deck, which runtime silently coerces", () => {
    const out = layout({
      requestedVisibleSlidesCount: 5,
      rawLength: 3,
      visibleSlidesCount: 3,
      canSlide: false,
    });
    expect(fields(out)).toContain("visibleSlidesNr");
  });

  it("distinguishes a ragged deck from one padded with clones", () => {
    expect(
      fields(layout({ hasPerfectPageLayout: false, didExtendLayout: false })),
    ).toContain("slidesData.length");

    expect(
      fields(
        layout({
          hasPerfectPageLayout: false,
          didExtendLayout: true,
          extendedLength: 12,
        }),
      ),
    ).toContain("isFullPagesOn");
  });

  it("flags a deck too short to move, since everything interactive goes with it", () => {
    expect(fields(layout({ canSlide: false }))).toContain("canSlide");
  });

  it("says nothing about an EMPTY deck — there is no mistake to report", () => {
    // Nothing was configured wrong; there is simply no data yet.
    expect(
      layout({ rawLength: 0, canSlide: false, visibleSlidesCount: 0 }),
    ).toEqual([]);
  });

  it("names the numbers a reader needs to act, not just the field", () => {
    const [warning] = layout({
      requestedVisibleSlidesCount: 9,
      rawLength: 4,
      visibleSlidesCount: 4,
      canSlide: false,
    });
    expect(warning!.consequence).toContain("9");
    expect(warning!.consequence).toContain("4");
  });
});
