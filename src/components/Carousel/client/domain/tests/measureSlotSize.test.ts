// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { measureSlotSize } from "../track";

/**
 * The one number the whole geometry rests on: the track transform, the gesture
 * calibration and the images' `sizes` all derive from it. It is measured, never
 * computed, because a slot is not a clean fraction of the window.
 *
 * The trap is the gap: it is read from a custom property with three fallbacks,
 * and a value CSS cannot give (or gives in a unit the parser does not expect)
 * must read as zero rather than poison every downstream calculation with NaN.
 */

let viewport: HTMLElement | null = null;

const mount = (
  width: number,
  style: Partial<Record<string, string>> = {},
): HTMLElement => {
  viewport = document.createElement("div");
  for (const [prop, value] of Object.entries(style)) {
    viewport.style.setProperty(prop, value as string);
  }
  Object.defineProperty(viewport, "offsetWidth", {
    configurable: true,
    value: width,
  });
  document.body.append(viewport);
  return viewport;
};

afterEach(() => {
  viewport?.remove();
  viewport = null;
});

describe("measureSlotSize", () => {
  it("divides the viewport plus one gap between the visible slides", () => {
    // Three slides with two 20px gaps between them: each slot is a slide plus
    // one gap's worth of stride, which is what the track advances by.
    const element = mount(600, { "--slides-gap": "20px" });
    expect(measureSlotSize(element, 3)).toBeCloseTo((600 + 20) / 3, 10);
  });

  it("is the whole viewport for a single visible slide", () => {
    const element = mount(600, { "--slides-gap": "0px" });
    expect(measureSlotSize(element, 1)).toBe(600);
  });

  it("prefers an explicitly passed width over reading the box again", () => {
    // The ResizeObserver already knows the width; re-reading offsetWidth there
    // would force a layout the callback is trying to avoid.
    const element = mount(600, { "--slides-gap": "0px" });
    expect(measureSlotSize(element, 2, 400)).toBe(200);
  });

  it("treats a missing gap as zero rather than NaN", () => {
    const element = mount(600);
    expect(measureSlotSize(element, 3)).toBeCloseTo(200, 10);
  });

  it("treats an unparseable gap as zero rather than NaN", () => {
    const element = mount(600, { "--slides-gap": "normal" });
    const slot = measureSlotSize(element, 3);
    expect(Number.isFinite(slot)).toBe(true);
    expect(slot).toBeCloseTo(200, 10);
  });

  it("returns 0 for a non-positive slide count instead of dividing by it", () => {
    const element = mount(600, { "--slides-gap": "20px" });
    expect(measureSlotSize(element, 0)).toBe(0);
    expect(measureSlotSize(element, -1)).toBe(0);
  });

  it("returns 0 for a collapsed viewport, which the caller reads as unmeasured", () => {
    const element = mount(0, { "--slides-gap": "0px" });
    expect(measureSlotSize(element, 3)).toBe(0);
  });

  it("falls back to --gap when --slides-gap is not set", () => {
    const element = mount(600, { "--gap": "30px" });
    expect(measureSlotSize(element, 3)).toBeCloseTo((600 + 30) / 3, 10);
  });
});
