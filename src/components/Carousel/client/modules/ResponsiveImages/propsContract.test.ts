import { describe, expect, it } from "vitest";

import type { ResponsiveImagesProps } from "./types";

/**
 * COMPILE-TIME contract of the props union: predecode is an upgrade of the
 * warm and cannot be requested with the master switch off. The
 * `@ts-expect-error` lines make `tsc -b` FAIL if the union ever stops
 * rejecting the dead combination.
 */
describe("ResponsiveImagesProps union", () => {
  it("forbids isPredecodeOn with isPreloadOn: false at the type level", () => {
    // @ts-expect-error — dead combination: predecode with the master off
    const dead: ResponsiveImagesProps = { isPreloadOn: false, isPredecodeOn: true };

    const masterOff: ResponsiveImagesProps = { isPreloadOn: false };
    const upgraded: ResponsiveImagesProps = { isPreloadOn: true, isPredecodeOn: true };
    const defaults: ResponsiveImagesProps = {};

    expect([dead, masterOff, upgraded, defaults]).toHaveLength(4);
  });
});
