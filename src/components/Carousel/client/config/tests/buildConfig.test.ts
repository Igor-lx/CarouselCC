import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../resolve/buildConfig";
import { CAROUSEL_DEFAULTS } from "../defaults";

/**
 * This file pins an ABSENCE, which is the only reason it exists.
 *
 * ADR-002 says every input is caller-owned: the config layer fills a gap and
 * does nothing else — no validation, no coercion, no clamping. A number that
 * makes no sense goes straight through to the geometry, and the host is the one
 * that has to care. That is a decision, not an oversight.
 *
 * Undecided, it would be repaired: `-1` slides per page looks like a bug from
 * the inside, and "adding a little validation here" is the most natural edit in
 * the file. It would also be a silent change of contract — the host loses the
 * error it was promised would surface, and gets a deck that quietly disagrees
 * with the numbers it was given.
 *
 * So the tests below assert that nothing is repaired. They are meant to go red
 * on such an edit and to send the reader to
 * `docs/adr/0002-trusted-runtime-inputs.md` rather than to a diff.
 */

describe("buildCarouselConfig — the only thing it substitutes is absence", () => {
  it("fills a missing field from the defaults", () => {
    const config = buildCarouselConfig({});
    expect(config.visibleSlidesCount).toBe(CAROUSEL_DEFAULTS.visibleSlidesNr);
    expect(config.stepDuration).toBe(CAROUSEL_DEFAULTS.durationStep);
    expect(config.errAltPlaceholder).toBe(CAROUSEL_DEFAULTS.errAltPlaceholder);
  });

  it("treats an explicit `undefined` exactly as an absent key", () => {
    expect(buildCarouselConfig({ visibleSlidesNr: undefined })).toEqual(
      buildCarouselConfig({}),
    );
  });

  it("passes a nonsensical number through untouched", () => {
    // Not clamped, not floored, not rejected: -1 and 0 reach the layout maths
    // as given. The deck degenerates, visibly, at the integration boundary —
    // which is where ADR-002 puts the failure on purpose.
    expect(
      buildCarouselConfig({ visibleSlidesNr: -1 }).visibleSlidesCount,
    ).toBe(-1);
    expect(buildCarouselConfig({ visibleSlidesNr: 0 }).visibleSlidesCount).toBe(
      0,
    );
    expect(buildCarouselConfig({ durationStep: 0 }).stepDuration).toBe(0);
  });

  it("passes NaN through, and does not fall back on it", () => {
    // The trap this pins: `NaN` is the one value where "looks empty, so use the
    // default" is tempting to write. Reading it as absent would hide a broken
    // number behind a working deck — the failure would surface much later, as
    // motion that is subtly wrong rather than obviously absent.
    expect(
      buildCarouselConfig({ durationStep: Number.NaN }).stepDuration,
    ).toBeNaN();
  });

  it("passes a value of the wrong type through, and does not coerce it", () => {
    // `RawConfigInput` types every field as `unknown` — the shape is the host's
    // to get right. A string here must NOT become a number.
    expect(buildCarouselConfig({ durationStep: "2000" }).stepDuration).toBe(
      "2000",
    );
    expect(
      buildCarouselConfig({ visibleSlidesNr: null }).visibleSlidesCount,
    ).toBe(null);
  });
});
