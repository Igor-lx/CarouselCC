import { describe, expect, it } from "vitest";

import type { CarouselDiagnosticContextValue } from "../../../../context";
import { collectLayoutWarnings, collectSlotWarnings } from "../layoutChecks";

type Layout = CarouselDiagnosticContextValue["layout"];
type Slots = CarouselDiagnosticContextValue["slots"];

/**
 * The two collectors that read a live deck rather than the module constants,
 * and so are the two that a test can actually drive.
 *
 * What is asserted here is the PAYLOAD: which field the warning names and what
 * value it reports for it. Both are machine-readable and both are what the
 * reader acts on — a warning pointing at the wrong flag, or reporting `false`
 * for something that is `true`, sends the host to look at the wrong prop and
 * costs more than saying nothing. The prose around them is reworded freely and
 * is pinned nowhere on purpose.
 */

const layout = (overrides: Partial<Layout> = {}): Layout => ({
  rawLength: 12,
  requestedVisibleSlidesCount: 3,
  visibleSlidesCount: 3,
  extendedLength: 12,
  didExtendLayout: false,
  hasPerfectPageLayout: true,
  canSlide: true,
  ...overrides,
});

const slots = (overrides: Partial<Slots> = {}): Slots => ({
  isControlsOn: false,
  hasControlsSlot: false,
  isPaginationOn: false,
  hasPaginationSlot: false,
  isPaginationInteractiveOn: false,
  hasResponsiveImagesSlot: false,
  deckCarriesImageSets: false,
  ...overrides,
});

const found = (warnings: { field: string; actual: unknown }[], field: string) =>
  warnings.find((warning) => warning.field === field);

describe("collectSlotWarnings — a switch turned on with nothing behind it", () => {
  it("says nothing about a deck whose switches and slots agree", () => {
    expect(collectSlotWarnings(slots())).toHaveLength(0);
    expect(
      collectSlotWarnings(slots({ isControlsOn: true, hasControlsSlot: true })),
    ).toHaveLength(0);
  });

  it("reports the flag that is on, and reports it as on", () => {
    // `actual: true` is not decoration: the host reads it to know which side
    // of the pair it got wrong — the switch, or the missing child.
    const warning = found(
      collectSlotWarnings(slots({ isControlsOn: true })),
      "isControlsOn",
    );
    expect(warning).toBeDefined();
    expect(warning?.actual).toBe(true);
  });

  it("reports a missing pagination slot the same way", () => {
    const warning = found(
      collectSlotWarnings(slots({ isPaginationOn: true })),
      "isPaginationOn",
    );
    expect(warning?.actual).toBe(true);
  });

  it("tells the two ResponsiveImages mistakes apart by the value alone", () => {
    // Both mistakes report the SAME field, so `actual` is the only thing that
    // says which one happened: the deck has variants and no slot to use them
    // (`false`), or the slot is mounted over a deck with nothing to serve
    // (`true`). Report the wrong one and the host removes the child they
    // needed, or adds one that changes nothing.
    const missingSlot = found(
      collectSlotWarnings(slots({ deckCarriesImageSets: true })),
      "ResponsiveImages",
    );
    expect(missingSlot?.actual).toBe(false);

    const idleSlot = found(
      collectSlotWarnings(slots({ hasResponsiveImagesSlot: true })),
      "ResponsiveImages",
    );
    expect(idleSlot?.actual).toBe(true);
  });
});

describe("collectLayoutWarnings — a deck that quietly disagrees with its props", () => {
  it("stays silent on an empty deck: data that has not arrived is not a mistake", () => {
    expect(collectLayoutWarnings(layout({ rawLength: 0 }))).toHaveLength(0);
  });

  it("flags a page size larger than the deck, and reports the asked-for count", () => {
    const warning = found(
      collectLayoutWarnings(
        layout({ rawLength: 2, requestedVisibleSlidesCount: 5 }),
      ),
      "visibleSlidesNr",
    );
    expect(warning?.actual).toBe(5);
  });

  it("accepts a page size EQUAL to the deck without comment", () => {
    // The boundary is the whole rule: asking for exactly as many slides as
    // exist is a legal one-page deck, not a silently coerced number.
    expect(
      collectLayoutWarnings(
        layout({
          rawLength: 3,
          requestedVisibleSlidesCount: 3,
          canSlide: false,
        }),
      ).map((warning) => warning.field),
    ).not.toContain("visibleSlidesNr");
  });

  it("flags a deck that cannot slide, and reports that it cannot", () => {
    const warning = found(
      collectLayoutWarnings(layout({ canSlide: false })),
      "canSlide",
    );
    expect(warning?.actual).toBe(false);
  });
});
