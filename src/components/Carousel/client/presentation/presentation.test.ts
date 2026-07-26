import { describe, expect, it } from "vitest";

import { SLIDE_REORIENT_VEIL } from "../config";
import { SLIDE_CLASS_KEYS } from "../public-api/types";
import { buildRootCssVars, buildSlideCssVars } from "./cssVars";
import { buildFlagAttributes, buildSlideClassMap } from "./domPayload";

/**
 * The JS→DOM presentation contract, tested where it now lives: pure builders
 * instead of memos buried in the composition root.
 */

describe("buildRootCssVars", () => {
  it("publishes exactly the declared variables", () => {
    expect(Object.keys(buildRootCssVars(3)).sort()).toEqual([
      "--slide-reorient-fade-in",
      "--slide-reorient-fade-out",
      "--visible-slides",
    ]);
  });

  it("formats the config timings as CSS time tokens", () => {
    const vars = buildRootCssVars(3);
    expect(vars["--slide-reorient-fade-out"]).toBe(
      `${SLIDE_REORIENT_VEIL.fadeOutMs}ms`,
    );
    expect(vars["--slide-reorient-fade-in"]).toBe(
      `${SLIDE_REORIENT_VEIL.fadeInMs}ms`,
    );
  });

  it("passes the live slot count through as a number", () => {
    expect(buildRootCssVars(4)["--visible-slides"]).toBe(4);
  });
});

describe("buildSlideCssVars", () => {
  it("carries the lane only — the one per-slide datum", () => {
    expect(Object.keys(buildSlideCssVars(5, 2))).toEqual(["--slide-lane"]);
  });

  it("is relative to the layout origin", () => {
    expect(buildSlideCssVars(5, 2)["--slide-lane"]).toBe(
      buildSlideCssVars(6, 3)["--slide-lane"],
    );
  });
});

describe("buildSlideClassMap", () => {
  it("returns every slide-facing key", () => {
    const map = buildSlideClassMap({});
    expect(Object.keys(map).sort()).toEqual([...SLIDE_CLASS_KEYS].sort());
  });

  it("substitutes an empty string for a missing key", () => {
    // `className={undefined}` would drop the attribute and break a host's
    // override chain, so absence must become "".
    expect(buildSlideClassMap({})[SLIDE_CLASS_KEYS[0]!]).toBe("");
  });

  it("passes provided classes through", () => {
    const key = SLIDE_CLASS_KEYS[0]!;
    expect(buildSlideClassMap({ [key]: "x" })[key]).toBe("x");
  });
});

describe("buildFlagAttributes", () => {
  it("stamps only ACTIVE flags, prefixed with data-", () => {
    expect(
      buildFlagAttributes({ "short-landscape": true, "tall-portrait": false }),
    ).toEqual({ "data-short-landscape": "true" });
  });

  it("returns nothing when no flag is active", () => {
    expect(buildFlagAttributes({ a: false })).toEqual({});
  });
});
