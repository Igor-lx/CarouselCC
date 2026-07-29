import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MEASUREMENT CONTRACT guard.
 *
 * Slide widths resolve as a percentage of the TRACK's content box, while the
 * JS slot math (`measureSlotSize`) reads the VIEWPORT's `offsetWidth` (border
 * box) and adds the gap: `slot = (width + gap) / visibleSlides`. The lane
 * stride is `slideWidth + gap`, which is the same number — but ONLY while
 * neither element carries padding or a border. Add either and the real slide
 * step becomes smaller than the transform step: motion overshoots by a couple
 * of pixels and jerks back into place on settle.
 *
 * Nothing else catches that — it compiles, renders and merely looks wrong on
 * device — so the rule is asserted against the real stylesheet here.
 *
 * `border-radius`, `box-sizing: border-box`, `outline` and explicit zero/none
 * declarations are all layout-neutral and deliberately allowed.
 */

const scss = readFileSync(
  resolve(__dirname, "../Carousel.module.scss"),
  "utf8",
);

/** The rule's OWN declarations — nested blocks (`&:focus-visible`, media
 * overrides) are stripped, since they are separate rules. */
const ownDeclarations = (selector: string): string => {
  const start = scss.indexOf(`${selector} {`);
  if (start === -1) return "";

  let depth = 0;
  let bodyStart = -1;
  let index = start;
  for (; index < scss.length; index += 1) {
    const char = scss[index];
    if (char === "{") {
      depth += 1;
      if (depth === 1) bodyStart = index + 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = scss.slice(bodyStart, index);

  // Drop nested blocks: everything from an inner `{` back to its match.
  let out = "";
  let nested = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "{") {
      nested += 1;
      // the nested selector text preceding `{` is not a declaration either
      out = out.slice(0, out.lastIndexOf(";") + 1);
      continue;
    }
    if (char === "}") {
      nested -= 1;
      continue;
    }
    if (nested === 0) out += char;
  }
  return out;
};

const isLayoutNeutral = (value: string): boolean =>
  value === "none" || /^(0(px|rem|em|%)?\s*)+$/.test(value);

/** Layout-affecting padding/border declarations of one rule. */
const offendingDeclarations = (selector: string): string[] => {
  const offenders: string[] = [];
  for (const raw of ownDeclarations(selector).split(";")) {
    const declaration = raw.replace(/\/\/.*$/gm, "").trim();
    if (!declaration.includes(":")) continue;
    const property = declaration.slice(0, declaration.indexOf(":")).trim();
    const value = declaration.slice(declaration.indexOf(":") + 1).trim();

    const isPadding = /^padding(-(top|right|bottom|left|inline|block))?/.test(
      property,
    );
    const isBorderWidth =
      /^border(-(top|right|bottom|left|inline|block))?(-width)?$/.test(property);

    if ((isPadding || isBorderWidth) && !isLayoutNeutral(value)) {
      offenders.push(declaration);
    }
  }
  return offenders;
};

const TRACK = ".slideContainer";
const VIEWPORT = ".innerContainer";

describe("measurement contract: track and viewport carry no padding/border", () => {
  it("the guarded rules exist and were parsed (a rename must not silently pass)", () => {
    expect(ownDeclarations(TRACK).trim().length).toBeGreaterThan(0);
    expect(ownDeclarations(VIEWPORT).trim().length).toBeGreaterThan(0);
  });

  it(`${TRACK} (the track) adds no padding or border`, () => {
    expect(offendingDeclarations(TRACK)).toEqual([]);
  });

  it(`${VIEWPORT} (the viewport) adds no padding or border`, () => {
    expect(offendingDeclarations(VIEWPORT)).toEqual([]);
  });

  it("layout-neutral declarations are not flagged (guard sanity)", () => {
    // The viewport legitimately carries border-radius and box-sizing; if the
    // matcher were naive, these would trip it.
    expect(ownDeclarations(VIEWPORT)).toContain("border-radius");
    expect(offendingDeclarations(VIEWPORT)).toEqual([]);
  });
});
