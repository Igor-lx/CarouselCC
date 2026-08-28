// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SLIDE_CANONICAL_SOURCE_MEDIA,
  SLIDE_VIEWPORT_BASE_BREAKPOINT,
  SLIDE_VIEWPORT_BREAKPOINTS,
  SLIDE_VIEWPORT_FLAGS,
} from "../../../../config";
import type { CarouselSlideMediaView } from "../../../../context";
import {
  collectSlideSourceMediaWarnings,
  collectViewportAxisWarnings,
  collectViewportCssWarnings,
} from "../viewportChecks";

/**
 * The viewport axes are the one table three separate things derive from: the
 * `data-*` states the root stamps, the `<source media>` strings the content
 * data must use, and the stylesheet blocks that style each tier. Nothing links
 * them at build time — they meet as strings — so this checker is the only
 * thing that can notice they have drifted apart.
 *
 * Which makes it an alarm, with an alarm's two failure modes. Staying silent
 * while a tier stamps a name no rule matches is the obvious one. Going off on
 * a healthy configuration is the worse one: a wiring warning nobody can act on
 * trains the reader to ignore the channel, and the real warnings go with it.
 * So every check below is asserted in BOTH directions.
 *
 * Written against the axis constants rather than against "desktop"/"tablet":
 * retuning the table must move these cases, not break them.
 */

const TIERS = Object.keys(SLIDE_VIEWPORT_BREAKPOINTS);
const NON_BASE_TIERS = TIERS.filter(
  (name) => name !== SLIDE_VIEWPORT_BASE_BREAKPOINT,
);
const FLAGS = Object.keys(SLIDE_VIEWPORT_FLAGS);

/** Every state name the root really stamps — the shape a healthy sheet keys on. */
const healthySheet = () =>
  [
    ...NON_BASE_TIERS.map(
      (name) => `[data-breakpoint="${name}"] { color: red; }`,
    ),
    ...FLAGS.map((flag) => `[data-${flag}="true"] { color: red; }`),
  ].join("\n");

let injected: HTMLStyleElement[] = [];

const inject = (css: string) => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  injected.push(style);
};

const fields = (warnings: Array<{ field: string }>) =>
  warnings.map((warning) => warning.field);

/** The browser's media parser — the external boundary of the axis audit. */
const installMatchMedia = (parseable: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: parseable ? query : "not all",
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => {
  injected = [];
});

afterEach(() => {
  for (const style of injected) style.remove();
  injected = [];
  vi.unstubAllGlobals();
});

describe("collectViewportAxisWarnings", () => {
  it("says nothing about the axes this project ships", () => {
    // The baseline the whole audit compares against. If the shipped table
    // cannot pass its own checker, every host that changes nothing is warned.
    installMatchMedia(true);
    expect(collectViewportAxisWarnings()).toEqual([]);
  });

  it("flags every canonical condition the browser cannot parse", () => {
    // A malformed condition never matches, so its tier's geometry, asset
    // choice and reorientation veil are all silently dead.
    installMatchMedia(false);
    const warnings = collectViewportAxisWarnings();

    expect(warnings).toHaveLength(SLIDE_CANONICAL_SOURCE_MEDIA.length);
    for (const warning of warnings) {
      expect(warning.field).toBe("SLIDE_CANONICAL_SOURCE_MEDIA");
      expect(warning.severity).toBe("CRITICAL");
    }
    expect(warnings.map((warning) => warning.actual).sort()).toEqual(
      [...SLIDE_CANONICAL_SOURCE_MEDIA].sort(),
    );
  });
});

describe("collectSlideSourceMediaWarnings", () => {
  const slideWith = (...media: string[]): CarouselSlideMediaView => ({
    sources: media.map((value) => ({ media: value, srcSet: "a.webp 1w" })),
  });

  it("says nothing when every source media is one of the axes' own strings", () => {
    expect(
      collectSlideSourceMediaWarnings([
        slideWith(...SLIDE_CANONICAL_SOURCE_MEDIA),
      ]),
    ).toEqual([]);
  });

  it("says nothing about slides that carry no art direction at all", () => {
    expect(collectSlideSourceMediaWarnings([{}, { sources: [] }])).toEqual([]);
  });

  it("flags a condition that is not one of the axes", () => {
    // The browser still evaluates it, so nothing looks broken — it just flips
    // on a threshold of its own, out of step with the slide box and the veil.
    const warnings = collectSlideSourceMediaWarnings([
      slideWith("(min-width: 601px)"),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.actual).toBe("(min-width: 601px)");
    expect(warnings[0]!.severity).toBe("LOGICAL");
  });

  it("reports each offending string once, however many slides repeat it", () => {
    // A whole generated deck carries the same handful of crops; one line per
    // mistake is the difference between a readable channel and a wall.
    const offender = "(orientation: sideways)";
    const warnings = collectSlideSourceMediaWarnings([
      slideWith(offender),
      slideWith(offender, offender),
      slideWith(offender),
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe("collectViewportCssWarnings", () => {
  it("says nothing about a stylesheet that keys on the real tiers and flags", () => {
    inject(healthySheet());
    expect(collectViewportCssWarnings()).toEqual([]);
  });

  it("flags a tier name the root will never stamp", () => {
    inject(`${healthySheet()}\n[data-breakpoint="phablet"] { color: red; }`);
    const warnings = collectViewportCssWarnings();
    expect(fields(warnings)).toEqual(["CSS [data-breakpoint]"]);
    expect(warnings[0]!.actual).toBe("phablet");
  });

  it("flags an orientation that is neither portrait nor landscape", () => {
    inject(`${healthySheet()}\n[data-orientation="sideways"] { color: red; }`);
    const warnings = collectViewportCssWarnings();
    expect(fields(warnings)).toEqual(["CSS [data-orientation]"]);
    expect(warnings[0]!.actual).toBe("sideways");
  });

  it("flags a declared tier that no rule anywhere references", () => {
    // The tier resolves and stamps, and styles nothing: either a forgotten
    // block or a deliberate fall-through to the base. Worth one line either way.
    const [orphan] = NON_BASE_TIERS;
    expect(orphan, "the axes need a non-base tier for this case").toBeDefined();
    inject(
      healthySheet()
        .split("\n")
        .filter((rule) => !rule.includes(`"${orphan}"`))
        .join("\n"),
    );
    const warnings = collectViewportCssWarnings();
    expect(fields(warnings)).toEqual(["SLIDE_VIEWPORT_BREAKPOINTS"]);
    expect(warnings[0]!.actual).toBe(orphan);
  });

  it("exempts the base tier, which the plain rule styles", () => {
    // The healthy sheet above never mentions it, and that is correct — a base
    // tier with its own attribute block would be the redundant one.
    inject(healthySheet());
    const warnings = collectViewportCssWarnings();
    expect(warnings.map((warning) => warning.actual)).not.toContain(
      SLIDE_VIEWPORT_BASE_BREAKPOINT,
    );
  });

  it("flags a declared flag that no rule anywhere references", () => {
    const [orphan] = FLAGS;
    expect(orphan, "the axes need a flag for this case").toBeDefined();
    inject(
      healthySheet()
        .split("\n")
        .filter((rule) => !rule.includes(`data-${orphan}`))
        .join("\n"),
    );
    const warnings = collectViewportCssWarnings();
    expect(fields(warnings)).toEqual(["SLIDE_VIEWPORT_FLAGS"]);
    expect(warnings[0]!.actual).toBe(orphan);
  });

  it("counts a reference nested inside a media block", () => {
    // Tier rules legitimately live inside @media wrappers; a scan that only
    // looked at top-level rules would report every one of them as orphaned.
    const [nested] = NON_BASE_TIERS;
    inject(
      `${healthySheet()
        .split("\n")
        .filter((rule) => !rule.includes(`"${nested}"`))
        .join("\n")}
      @media (min-width: 1px) {
        [data-breakpoint="${nested}"] { color: red; }
      }`,
    );
    expect(collectViewportCssWarnings()).toEqual([]);
  });
});
