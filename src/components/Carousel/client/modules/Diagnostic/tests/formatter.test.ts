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
    // The clauses are joined by a space, not concatenated: without it the
    // field name grows into the next sentence and neither can be searched for.
    expect(formatWarning(warning())).toContain("visibleSlidesNr has value");
  });

  it("states the offending value, what was expected and what follows from it", () => {
    const line = formatWarning(warning());
    expect(line).toContain("has value 5.");
    expect(line).toContain("Expected visibleSlidesNr not to exceed");
    expect(line).toContain("Runtime coerces the visible band.");
  });

  it("says outright that it changed nothing", () => {
    // Observe-only is the module's whole promise; the line has to carry it.
    expect(formatWarning(warning())).toContain(
      "does not apply runtime changes",
    );
  });

  it("renders the values that break naive stringification", () => {
    expect(formatWarning(warning({ actual: Number.NaN }))).toContain("NaN");
    expect(formatWarning(warning({ actual: Infinity }))).toContain("Infinity");
    expect(formatWarning(warning({ actual: -Infinity }))).toContain(
      "-Infinity",
    );
    expect(formatWarning(warning({ actual: undefined }))).toContain(
      "undefined",
    );
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
    // And drops it WHOLE. Anything standing in for the empty clause — a bare
    // full stop, a placeholder — reads as a sentence the author wrote, so the
    // seam itself is what gets checked.
    expect(line).toContain("deck length. Diagnostics is observe-only");
    expect(line).not.toMatch(/\s\.\s/);
  });

  it("punctuates by the END of the clause, not by any dot inside it", () => {
    // "e.g." carries a full stop in the middle. Judge the sentence by that and
    // it is left unfinished, running into the next clause of the same line.
    const line = formatWarning(
      warning({ expected: "Expected a count, e.g. 3" }),
    );
    expect(line).toContain("Expected a count, e.g. 3.");
  });

  it("names a value that JSON cannot render, instead of losing it", () => {
    // `JSON.stringify` returns undefined for a symbol and throws on a bigint.
    // Both must still come out as themselves: "[object Symbol]" tells the
    // reader nothing about WHICH symbol, and a thrown formatter tells them
    // nothing at all.
    expect(formatWarning(warning({ actual: Symbol("axis") }))).toContain(
      "Symbol(axis)",
    );
    expect(formatWarning(warning({ actual: 10n }))).toContain("10n");
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

describe("warningSignature — the separator keeps two warnings apart", () => {
  it("tells apart warnings whose fields merely spell the same run of text", () => {
    // Layer "Props" with field "a" against layer "Prop" with field "sa":
    // identical once concatenated, different the moment a separator sits
    // between them. Without it the second is swallowed as a repeat of the
    // first, and the developer hears about one problem instead of two.
    expect(warningSignature(warning({ layer: "Props", field: "a" }))).not.toBe(
      warningSignature(warning({ layer: "Prop", field: "sa" })),
    );
  });
});
