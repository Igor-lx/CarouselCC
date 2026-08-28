// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SlideItem } from "../SlideItem";
import type { SlideItemProps } from "../SlideItem.types";
import { createImageResourceStore } from "../imageResource";
import type { ImageResourceStore } from "../imageResource";
import type { Slide } from "../../public-api/types";

/**
 * One function decides: `<button>` or `<div>`, `<picture>` or a bare `<img>`,
 * whether to mount the image AT ALL, and whether to show the error text.
 *
 * The expensive branch is the bandwidth gate. The component's own comment
 * spells out why the sources are withheld by NOT MOUNTING the element: an
 * `<img>` with no `src` inside a `<picture>` still resolves a candidate from
 * the `<source>`s and fetches it. Mount it "empty" and the gate silently
 * stops saving anything — no error, no visual difference, just traffic.
 */

const IMAGE: Slide = {
  id: "img",
  content: "https://example.test/photo.webp",
  alt: "a photo",
  image: {
    srcSet: "https://example.test/photo-480.webp 480w",
    sources: [
      { media: "(orientation: portrait)", srcSet: "https://example.test/tall.webp 480w" },
    ],
  },
};

const TEXT: Slide = { id: "txt", content: "just words" };

let host: HTMLDivElement;
let root: Root;
let store: ImageResourceStore;

const base = (): SlideItemProps => ({
  slideData: IMAGE,
  className: { slide: "slide", slideInteractive: "", slideError: "", slideText: "" },
  style: {},
  isContentImg: true,
  isResponsiveImagesOn: true,
  errAltPlaceholder: "Downloading Error",
  isInteractiveOn: false,
  isActive: true,
  isActual: true,
  isFetchOn: true,
  isDataSaverEnabled: false,
  imageResourceStore: store,
  imageSizes: "400px",
  viewportSignature: "0110",
});

const render = (overrides: Partial<SlideItemProps> = {}) =>
  act(() => {
    root.render(<SlideItem {...base()} {...overrides} />);
  });

const img = () => host.querySelector("img");
const picture = () => host.querySelector("picture");
const rootEl = () => host.firstElementChild as HTMLElement;

beforeEach(() => {
  store = createImageResourceStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SlideItem — the bandwidth gate", () => {
  // Which slides may fetch is the composition root's decision (band always,
  // buffer by reach); SlideItem only honours the verdict it is handed.
  it("mounts nothing for a slide that may not fetch", () => {
    render({ isActual: false, isFetchOn: false });
    // Not "mounted without a src" — absent. A src-less <img> inside <picture>
    // would still fetch a <source> candidate, which is the whole point.
    expect(img()).toBeNull();
    expect(picture()).toBeNull();
  });

  it("mounts the image once it is allowed to fetch", () => {
    render({ isActual: false, isFetchOn: false });
    expect(img()).toBeNull();
    render({ isActual: false, isFetchOn: true });
    expect(img()).not.toBeNull();
  });
});

describe("SlideItem — the responsive stack", () => {
  it("wraps the image in a <picture> when the slide carries art direction", () => {
    render({ isResponsiveImagesOn: true });
    expect(picture()).not.toBeNull();
    expect(picture()!.querySelectorAll("source")).toHaveLength(1);
  });

  it("renders a bare <img> with the publisher's chosen asset when the module is absent", () => {
    render({ isResponsiveImagesOn: false });
    expect(picture()).toBeNull();
    expect(img()).not.toBeNull();
    // No responsive attributes leak out when the stack is off.
    expect(img()!.getAttribute("srcset")).toBeNull();
    expect(img()!.getAttribute("sizes")).toBeNull();
  });

  it("prefers the slide's own sizes over the carousel's measurement", () => {
    render({
      slideData: { ...IMAGE, image: { ...IMAGE.image, sizes: "50vw" } },
      imageSizes: "400px",
    });
    expect(img()!.getAttribute("sizes")).toBe("50vw");
  });
});

describe("SlideItem — loading priority", () => {
  it("asks for the on-screen band eagerly and at high priority", () => {
    render({ isActual: true });
    expect(img()!.getAttribute("loading")).toBe("eager");
    expect(img()!.getAttribute("fetchpriority")).toBe("high");
  });

  it("defers off-band images under reduced data, and not otherwise", () => {
    render({ isActual: false, isDataSaverEnabled: true });
    expect(img()!.getAttribute("loading")).toBe("lazy");
    expect(img()!.getAttribute("fetchpriority")).toBe("low");

    render({ isActual: false, isDataSaverEnabled: false });
    expect(img()!.getAttribute("loading")).toBe("eager");
    expect(img()!.getAttribute("fetchpriority")).toBe("auto");
  });
});

describe("SlideItem — failure", () => {
  it("shows text instead of an empty frame when the image gives up", () => {
    render();
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(img()).toBeNull();
    expect(rootEl().textContent).toBe("a photo");
  });

  it("falls back to the placeholder when the slide has no alt of its own", () => {
    render({ slideData: { ...IMAGE, alt: undefined } });
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(rootEl().textContent).toBe("Downloading Error");
  });
});

describe("SlideItem — interactivity", () => {
  const markLoaded = () =>
    act(() => {
      img()!.dispatchEvent(new Event("load"));
    });

  it("is a plain div until every condition for a click is met", () => {
    render({ isInteractiveOn: false, onSlideClick: vi.fn() });
    expect(rootEl().tagName).toBe("DIV");

    render({ isInteractiveOn: true }); // no handler
    expect(rootEl().tagName).toBe("DIV");
  });

  it("becomes a real button once interactive, handled and loaded", () => {
    const onSlideClick = vi.fn();
    render({ isInteractiveOn: true, onSlideClick });
    // Still a div: the image has not loaded, so there is nothing to open yet.
    expect(rootEl().tagName).toBe("DIV");

    markLoaded();
    render({ isInteractiveOn: true, onSlideClick });
    expect(rootEl().tagName).toBe("BUTTON");
    expect(rootEl().getAttribute("type")).toBe("button");

    (rootEl()).click();
    expect(onSlideClick).toHaveBeenCalledWith(IMAGE);
  });

  it("a text slide is clickable immediately — there is no image to wait for", () => {
    const onSlideClick = vi.fn();
    render({ slideData: TEXT, isContentImg: false, isInteractiveOn: true, onSlideClick });
    expect(rootEl().tagName).toBe("BUTTON");
    (rootEl()).click();
    expect(onSlideClick).toHaveBeenCalledWith(TEXT);
  });
});

describe("SlideItem — band attributes", () => {
  it("marks the on-screen band and inerts everything else", () => {
    render({ isActive: true, isActual: true });
    expect(rootEl().getAttribute("data-active-zone")).toBe("true");
    expect(rootEl().hasAttribute("inert")).toBe(false);

    render({ isActive: false, isActual: false });
    expect(rootEl().getAttribute("data-active-zone")).toBe("false");
    expect(rootEl().hasAttribute("inert")).toBe(true);
  });

  it("keeps a slide reachable while it is still travelling off screen", () => {
    // isActive without isActual: mid-ride, the outgoing slide must not go inert
    // under the finger or a long-press menu dies.
    render({ isActive: true, isActual: false });
    expect(rootEl().hasAttribute("inert")).toBe(false);
    expect(rootEl().getAttribute("data-active-zone")).toBe("false");
  });

  it("renders nothing for a missing slide instead of throwing", () => {
    render({ slideData: null });
    expect(host.firstElementChild).toBeNull();
  });
});
