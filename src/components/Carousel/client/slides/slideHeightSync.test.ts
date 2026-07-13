import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard for the optional fixed-height knob. On this branch the slides are
 * in flex flow, so a pinned slide height also sizes the track — one rule
 * governs both. Read the real stylesheet and assert the slide honours the
 * variable, so the knob can never silently disappear (same pattern as
 * `orientationMediaSync.test.ts`).
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

describe("--slide-height", () => {
  it("is declared with an auto default (fluid unless overridden)", () => {
    expect(scss).toContain("--slide-height: auto;");
  });

  it("the slide box honours --slide-height", () => {
    expect(rule(".slide")).toContain("height: var(--slide-height)");
  });

  it("still carries aspect-ratio, so auto falls back to the fluid ratio", () => {
    expect(rule(".slide")).toContain("aspect-ratio: var(--slide-aspect)");
  });
});
