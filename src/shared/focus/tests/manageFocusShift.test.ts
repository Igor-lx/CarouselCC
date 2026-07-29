// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { manageFocusShift } from "../manageFocusShift";

/**
 * The keyboard's escape hatch. When the deck settles on a new page, the slide
 * that had focus may now be OUTSIDE the active band and marked `inert` — the
 * browser then refuses to focus it, focus falls to `document.body`, and tab
 * order restarts from the top of the page. No error, no warning: keyboard
 * navigation simply dies mid-carousel.
 *
 * jsdom does not implement `inert`, so the attribute is present but does not
 * actually block focus here. That is fine: this function decides WHERE focus
 * should go by reading the attributes, and that decision is what is tested.
 */

let container: HTMLElement;

/**
 * A carousel-shaped container: slides carry `data-active-zone`, exactly as
 * `SlideItem` stamps it, and the inactive ones carry `inert` too.
 */
const build = (zones: Array<{ active: boolean; focusable?: boolean }>) => {
  container = document.createElement("div");
  container.tabIndex = -1;
  for (const [index, zone] of zones.entries()) {
    const slide = document.createElement(zone.focusable ? "button" : "div");
    slide.setAttribute("data-active-zone", String(zone.active));
    slide.dataset.index = String(index);
    if (!zone.active) slide.setAttribute("inert", "");
    container.append(slide);
  }
  document.body.append(container);
  return container;
};

const slideAt = (index: number) =>
  container.querySelector<HTMLElement>(`[data-index="${index}"]`)!;

afterEach(() => {
  container?.remove();
  document.body.innerHTML = "";
});

describe("manageFocusShift", () => {
  it("moves focus out of a slide that has left the active band", () => {
    build([
      { active: false, focusable: true },
      { active: true, focusable: true },
    ]);
    slideAt(0).focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(slideAt(1));
  });

  it("leaves focus alone when the focused slide is still active", () => {
    build([
      { active: true, focusable: true },
      { active: false, focusable: true },
    ]);
    slideAt(0).focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(slideAt(0));
  });

  it("falls back to the container when the active band has nothing focusable", () => {
    build([{ active: false, focusable: true }, { active: true }]);
    slideAt(0).focus();

    manageFocusShift(container);

    // Focus stays inside the carousel, so tab order resumes from here rather
    // than from the top of the document.
    expect(document.activeElement).toBe(container);
  });

  it("reaches a focusable child INSIDE the active slide", () => {
    build([{ active: false, focusable: true }, { active: true }]);
    const link = document.createElement("a");
    link.href = "#somewhere";
    slideAt(1).append(link);
    slideAt(0).focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(link);
  });

  it("never touches focus that is outside the carousel", () => {
    build([{ active: true, focusable: true }]);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(outside);
  });

  it("never touches focus that is inside the carousel but not on a slide", () => {
    // An arrow button or a dot: chrome, not a slide, so not the band's business.
    build([{ active: true, focusable: true }]);
    const chrome = document.createElement("button");
    container.append(chrome);
    chrome.focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(chrome);
  });

  it("does nothing at all without a container", () => {
    build([{ active: true, focusable: true }]);
    slideAt(0).focus();

    expect(() => manageFocusShift(null)).not.toThrow();
    expect(document.activeElement).toBe(slideAt(0));
  });

  it("rescues focus that is inside an inert subtree even on an active slide", () => {
    // The band flag says active, but an ancestor is inert — the browser would
    // still refuse the focus, so the shift has to happen anyway.
    build([{ active: true }, { active: true, focusable: true }]);
    const trapped = document.createElement("button");
    slideAt(0).setAttribute("inert", "");
    slideAt(0).append(trapped);
    trapped.focus();

    manageFocusShift(container);

    expect(document.activeElement).toBe(slideAt(1));
  });
});
