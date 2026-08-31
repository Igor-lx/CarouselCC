// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useGroupedWarnings } from "../useGroupedWarnings";
import type { CarouselDiagnosticWarning } from "../types";

/**
 * The dedupe, which the hook's own header calls the load-bearing half — and it
 * is the half with two opposite ways to fail, both of which end with the
 * channel being ignored.
 *
 * Too coarse, and a genuinely new warning is swallowed as a repeat: the
 * developer is told about the first problem and never about the second. Too
 * fine, and the same line prints once per render — a carousel renders on every
 * ride, so the console fills in seconds and the channel gets muted for good,
 * along with everything it would have said later.
 */

const warning = (
  overrides: Partial<CarouselDiagnosticWarning> = {},
): CarouselDiagnosticWarning => ({
  severity: "CRITICAL",
  layer: "Props",
  field: "visibleSlidesNr",
  actual: -1,
  expected: "Expected a positive integer",
  consequence: "Page math breaks",
  ...overrides,
});

let host: HTMLDivElement;
let root: Root;
let warn: MockInstance<typeof console.warn>;

function Probe({ warnings }: { warnings: CarouselDiagnosticWarning[] }) {
  useGroupedWarnings(warnings);
  return null;
}

const render = (warnings: CarouselDiagnosticWarning[]) =>
  act(() => {
    root.render(<Probe warnings={warnings} />);
  });

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("useGroupedWarnings", () => {
  it("prints a warning once, however often the deck re-renders", () => {
    // A fresh array each render, same content: identity cannot be the test,
    // which is why the signature exists.
    render([warning()]);
    render([warning()]);
    render([warning()]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("prints again when a DIFFERENT problem appears", () => {
    render([warning()]);
    render([warning({ field: "durationStep" })]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("notices a change of value on the same field", () => {
    // The signature carries `actual`, so the same field with a new bad value
    // is a new problem — not a repeat of the old one.
    render([warning({ actual: -1 })]);
    render([warning({ actual: 0 })]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("prints every warning of a set, not just the first", () => {
    render([warning(), warning({ field: "durationStep" })]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("says nothing at all when there is nothing wrong", () => {
    render([]);
    render([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("re-announces a problem that went away and came back", () => {
    // Clearing the signature on an empty set is what makes this work: without
    // it the returning problem reads as a repeat and is swallowed.
    render([warning()]);
    render([]);
    render([warning()]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
