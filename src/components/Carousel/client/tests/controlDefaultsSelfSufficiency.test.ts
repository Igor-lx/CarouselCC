import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "sass-embedded";

/**
 * The component neutralises the browser's own control defaults itself.
 *
 * A `<button>` arrives from the UA with `padding: 1px 6px`, content-box
 * sizing, a border, and a font that does NOT inherit. The deck renders three
 * of them — a clickable slide, a nav zone, a pagination dot — and every one is
 * sized by the layout maths: a nav zone by percentage, a dot by a deliberately
 * tiny fixed size, a slide by the measured slot. Let the UA padding through
 * and each is wider than the geometry believes, so the track's transform and
 * the element it moves disagree.
 *
 * This used to work only because the demo stand ships a global reset in
 * `src/globals.scss` — a file the component does not own and would not carry
 * into another project. Nothing announced the dependency; it was found by
 * reading. These cases pin the neutralising to the component's own
 * stylesheets, so lifting it into a host with no reset lays out the same.
 *
 * Asserted on the COMPILED css rather than the source, so it holds whether the
 * declarations are written inline or pulled in through the shared mixin.
 */

const clientRoot = resolve(__dirname, "..");

/** Declarations of one class's rule, flattened across the whole stylesheet. */
const declarationsOf = (stylesheet: string, className: string): string => {
  const css = compile(resolve(clientRoot, stylesheet), { style: "expanded" }).css;
  // Sass keeps the @layer wrapper and indentation; take every block whose
  // selector list ends with exactly this class.
  const bodies = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) =>
      (match[1] ?? "").split(",").some((one) => one.trim() === `.${className}`),
    )
    .map((match) => match[2] ?? "");
  expect(bodies.length, `no rule for .${className} in ${stylesheet}`).toBeGreaterThan(0);
  return bodies.join(";");
};

/** The UA defaults that would move something if they survived. */
const BUTTON_DEFAULTS_TO_KILL = [
  [/box-sizing:\s*border-box/, "content-box sizing would add the padding to the width"],
  [/(^|[\s;{])padding:\s*0/, "the UA's 1px 6px padding would inflate the control"],
  [/(^|[\s;{])margin:\s*0/, "the UA margin would offset it inside the layout"],
  [/border:\s*none/, "the UA border would add two more pixels"],
  [/font:\s*inherit/, "font does not inherit into form controls"],
] as const;

const BUTTONS: ReadonlyArray<readonly [string, string]> = [
  ["Carousel.module.scss", "slide"],
  ["modules/Controls/Controls.module.scss", "navZone"],
  ["modules/Pagination/basic/Pagination.module.scss", "dot"],
];

describe("the component neutralises control defaults without a host reset", () => {
  it.each(BUTTONS)("%s → .%s", (stylesheet, className) => {
    const declarations = declarationsOf(stylesheet, className);
    for (const [pattern, why] of BUTTON_DEFAULTS_TO_KILL) {
      expect(pattern.test(declarations), `.${className}: ${why}`).toBe(true);
    }
  });

  it("the pagination strip sizes its own padding in", () => {
    // Not a button, but full-width WITH padding: content-box would push it
    // past its parent.
    const declarations = declarationsOf(
      "modules/Pagination/basic/Pagination.module.scss",
      "paginationWrapper",
    );
    expect(/box-sizing:\s*border-box/.test(declarations)).toBe(true);
  });
});
