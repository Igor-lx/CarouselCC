import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../resolve/buildConfig";
import { CAROUSEL_DEFAULTS } from "../defaults";
import {
  CAROUSEL_INERTIAL_RELEASE_CONFIG,
  CAROUSEL_SWIPE_CONFIG,
} from "../gesture";
import {
  PAUSE_HOVER_DELAY_MS,
  PAUSE_VISIBILITY_RATIO,
  AUTOPLAY_RESETTLE_DELAY_MS,
} from "../interaction";
import {
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
} from "../motion";

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
 * ADR-002 rather than to a diff.
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

/**
 * The gesture settings are module constants, and the engine writes into what it
 * is handed. Passed by reference, one carousel retuning its own swipe would
 * retune every other carousel in the bundle — the same object, mutated once.
 * The copy is what prevents that, and it is invisible: values compare equal
 * either way, so only identity can tell a copy from a shared reference.
 *
 * Recorded as an invariant; until now nothing held it, and a mutation run said
 * so — emptying either spread killed no test.
 */
describe("buildCarouselConfig — gesture settings are copied, not shared", () => {
  it("hands out a copy of the swipe config, nested commit included", () => {
    const config = buildCarouselConfig({});
    expect(config.swipeConfig).toEqual(CAROUSEL_SWIPE_CONFIG);
    expect(config.swipeConfig).not.toBe(CAROUSEL_SWIPE_CONFIG);
    // The nested object is the one that is easy to miss: a shallow spread
    // would carry the SAME `commit` through, and the leak comes back.
    expect(config.swipeConfig.commit).toEqual(CAROUSEL_SWIPE_CONFIG.commit);
    expect(config.swipeConfig.commit).not.toBe(CAROUSEL_SWIPE_CONFIG.commit);
  });

  it("hands out a copy of the release config", () => {
    const config = buildCarouselConfig({});
    expect(config.releaseConfig).toEqual(CAROUSEL_INERTIAL_RELEASE_CONFIG);
    expect(config.releaseConfig).not.toBe(CAROUSEL_INERTIAL_RELEASE_CONFIG);
  });

  it("gives each caller its own copy, so one cannot retune another", () => {
    const first = buildCarouselConfig({});
    const second = buildCarouselConfig({});
    expect(first.swipeConfig).not.toBe(second.swipeConfig);
    expect(first.releaseConfig).not.toBe(second.releaseConfig);
  });
});

/**
 * Two blocks of the assembled config were read by no test at all, so emptying
 * them changed nothing anyone could see. They are not decoration: the pause
 * numbers gate autoplay, and the snap-back shares are the profile a rubber-band
 * release is animated with. Emptied, both become `undefined` deep inside the
 * motion maths, where they read as NaN rather than as a missing setting.
 */
describe("buildCarouselConfig — the blocks nothing else reads", () => {
  it("carries the interaction pauses", () => {
    expect(buildCarouselConfig({}).interaction).toEqual({
      hoverPauseDelayMs: PAUSE_HOVER_DELAY_MS,
      visibilityRatio: PAUSE_VISIBILITY_RATIO,
      autoplayResettleDelayMs: AUTOPLAY_RESETTLE_DELAY_MS,
    });
  });

  it("carries the snap-back profile", () => {
    expect(buildCarouselConfig({}).motion.snapBackProfile).toEqual({
      accelerationDistanceShare: SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
      decelerationDistanceShare: SNAP_BACK_DECELERATION_DISTANCE_SHARE,
    });
  });
});
