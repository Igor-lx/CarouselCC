import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SSOT guard for the optional fixed-height knob. The slide box and the
 * invisible height sizer derive the track's height; if only ONE of them
 * honoured `--slide-height`, a host pinning the height would desync the
 * slides from the track (and the overflow clip). Read the real stylesheet
 * and assert both consume the same variable — same pattern as
 * `orientationMediaSync.test.ts`.
 */
const scss = readFileSync(
  resolve(__dirname, "../Carousel.module.scss"),
  "utf8",
);

/**
 * Every declaration that applies to `selector`, across ALL rules that name it
 * (CSS cascades, and the width is shared through a `.slideSizer, .slide`
 * list). Brace-matched so nested blocks inside a rule come along.
 */
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = new RegExp(`(^|[\\s,])${escaped}(\\s|,|$)`);
  const bodies: string[] = [];

  for (let open = scss.indexOf("{"); open !== -1; open = scss.indexOf("{", open + 1)) {
    // The selector list runs back to the previous block boundary.
    let start = open - 1;
    while (start >= 0 && !"{};".includes(scss[start]!)) start -= 1;
    if (!names.test(scss.slice(start + 1, open))) continue;

    let depth = 1;
    let end = open + 1;
    for (; end < scss.length && depth > 0; end += 1) {
      if (scss[end] === "{") depth += 1;
      else if (scss[end] === "}") depth -= 1;
    }
    bodies.push(scss.slice(open + 1, end - 1));
  }

  if (bodies.length === 0) throw new Error(`no rule targets ${selector}`);
  return bodies.join("\n");
};

describe("--slide-height SSOT", () => {
  it("is declared with an auto default (fluid unless overridden)", () => {
    expect(scss).toContain("--slide-height: auto;");
  });

  it("the slide box honours --slide-height", () => {
    expect(rule(".slide")).toContain("height: var(--slide-height)");
  });

  it("the height sizer honours the SAME variable", () => {
    expect(rule(".slideSizer")).toContain("height: var(--slide-height)");
  });

  it("both still carry aspect-ratio, so auto falls back to the fluid ratio", () => {
    expect(rule(".slide")).toContain("aspect-ratio: var(--slide-aspect)");
    expect(rule(".slideSizer")).toContain("aspect-ratio: var(--slide-aspect)");
  });
});
