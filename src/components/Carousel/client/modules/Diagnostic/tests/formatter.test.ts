import { describe, expect, it } from "vitest";

import { formatWarning, warningSignature } from "../formatter";
import type { CarouselDiagnosticWarning } from "../types";

/**
 * The line a developer actually reads, and the signature that stops it being
 * printed again on every render.
 *
 * The signature is the load-bearing half: too coarse and a genuinely new
 * warning is swallowed as a repeat; too fine and the console fills with the
 * same message once per frame, which is how a diagnostics channel gets muted
 * for good.
 */

const warning = (
  overrides: Partial<CarouselDiagnosticWarning> = {},
): CarouselDiagnosticWarning => ({
  severity: "LOGICAL",
  layer: "Layout",
  field: "visibleSlidesNr",
  actual: 5,
  expected: "Expected visibleSlidesNr not to exceed the deck length",
  consequence: "Runtime coerces the visible band",
  ...overrides,
});

describe("formatWarning", () => {
  it("leads with severity, layer and field, so the line is scannable", () => {
    expect(formatWarning(warning())).toContain(
      "[Carousel Diagnostic][LOGICAL] Layout -> visibleSlidesNr",
    );
  });

  it("states the offending value, what was expected and what follows from it", () => {
    const line = formatWarning(warning());
    expect(line).toContain("has value 5.");
    expect(line).toContain("Expected visibleSlidesNr not to exceed");
    expect(line).toContain("Runtime coerces the visible band.");
  });

  it("says outright that it changed nothing", () => {
    // Observe-only is the module's whole promise; the line has to carry it.
    expect(formatWarning(warning())).toContain("does not apply runtime changes");
  });

  it("renders the values that break naive stringification", () => {
    expect(formatWarning(warning({ actual: Number.NaN }))).toContain("NaN");
    expect(formatWarning(warning({ actual: Infinity }))).toContain("Infinity");
    expect(formatWarning(warning({ actual: undefined }))).toContain("undefined");
    expect(formatWarning(warning({ actual: null }))).toContain("null");
    expect(formatWarning(warning({ actual: "auto" }))).toContain('"auto"');
    expect(formatWarning(warning({ actual: { a: 1 } }))).toContain('{"a":1}');
  });

  it("survives a value that cannot be serialised at all", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatWarning(warning({ actual: circular }))).not.toThrow();
  });

  it("punctuates sentences the author left unpunctuated, and does not double up", () => {
    const line = formatWarning(
      warning({ expected: "Expected a slot", consequence: "Nothing renders." }),
    );
    expect(line).toContain("Expected a slot.");
    expect(line).toContain("Nothing renders.");
    expect(line).not.toContain("..");
  });

  it("drops an empty clause rather than leaving a gap in the line", () => {
    const line = formatWarning(warning({ consequence: "   " }));
    expect(line).not.toContain("  ");
  });
});

describe("warningSignature", () => {
  it("is identical for two identical warnings", () => {
    expect(warningSignature(warning())).toBe(warningSignature(warning()));
  });

  it("changes with EVERY field a reader would notice", () => {
    const base = warningSignature(warning());
    const variants: Array<Partial<CarouselDiagnosticWarning>> = [
      { severity: "CRITICAL" },
      { layer: "Slots" },
      { field: "isPaginationOn" },
      { actual: 6 },
      { expected: "something else" },
      { consequence: "something else" },
    ];
    for (const overrides of variants) {
      expect(
        warningSignature(warning(overrides)),
        `${Object.keys(overrides)[0]} did not change the signature — a new warning would be swallowed as a repeat`,
      ).not.toBe(base);
    }
  });

  it("tells apart values that stringify the same way", () => {
    // "5" and 5 read identically in a naive join; the reader would see one
    // warning where there are two different ones.
    expect(warningSignature(warning({ actual: 5 }))).not.toBe(
      warningSignature(warning({ actual: "5" })),
    );
  });
});
