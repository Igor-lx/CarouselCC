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

const rule = (selector: string): string => {
  const start = scss.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`rule ${selector} not found`);
  return scss.slice(start, scss.indexOf("}", start));
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
