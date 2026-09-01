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
      {
        media: "(orientation: portrait)",
        srcSet: "https://example.test/tall.webp 480w",
      },
    ],
  },
};

const TEXT: Slide = { id: "txt", content: "just words" };

let host: HTMLDivElement;
let root: Root;
let store: ImageResourceStore;

const base = (): SlideItemProps => ({
  slideData: IMAGE,
  className: {
    slide: "slide",
    slideInteractive: "",
    slideError: "",
    slideText: "",
  },
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

  it("is a button from the first paint, before any pixel has arrived", () => {
    // The tab order is decided by the markup, and the markup must not wait for
    // the network: a slide that joins the tab order when its image lands moves
    // the stops under a user who is already tabbing. The element type is also
    // the identity of the DOM node — swapping it re-creates the whole subtree,
    // `<img>` and all.
    const onSlideClick = vi.fn();
    render({ isInteractiveOn: true, onSlideClick });

    expect(rootEl().tagName).toBe("BUTTON");
    expect(rootEl().getAttribute("type")).toBe("button");

    rootEl().click();
    expect(onSlideClick).toHaveBeenCalledWith(IMAGE);
  });

  it("stays the same button through the load, without re-creating the node", () => {
    const onSlideClick = vi.fn();
    render({ isInteractiveOn: true, onSlideClick });
    const before = rootEl();

    markLoaded();
    render({ isInteractiveOn: true, onSlideClick });

    expect(rootEl().tagName).toBe("BUTTON");
    // The very same element: React keeps the node when the tag does not change.
    expect(rootEl()).toBe(before);
  });

  it("a slide whose image failed is still focusable and still reports its click", () => {
    // What the deck shows is a placeholder, not an absence: the item exists,
    // and whether it is worth opening without its picture is the host's call —
    // it holds the slide, we hold only the pixels that did not arrive.
    const onSlideClick = vi.fn();
    render({ isInteractiveOn: true, onSlideClick });
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });

    expect(rootEl().tagName).toBe("BUTTON");
    expect(rootEl().textContent).toBe("a photo");

    rootEl().click();
    expect(onSlideClick).toHaveBeenCalledWith(IMAGE);
  });

  it("a text slide is clickable immediately — there is no image to wait for", () => {
    const onSlideClick = vi.fn();
    render({
      slideData: TEXT,
      isContentImg: false,
      isInteractiveOn: true,
      onSlideClick,
    });
    expect(rootEl().tagName).toBe("BUTTON");
    rootEl().click();
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

/**
 * The flags the slide wears, and the one effect it runs.
 *
 * Every class name in the harness above is an empty string, so the three
 * conditional classes were pinned by nothing: each of their mutants walked
 * straight through. They are what the stylesheet hangs the error, text and
 * interactive treatments on — a slide that always wears `slideError` looks
 * broken while it is merely loading.
 */
describe("SlideItem — the conditional classes", () => {
  const named = {
    slide: "slide",
    slideInteractive: "is-interactive",
    slideError: "is-error",
    slideText: "is-text",
  };

  it("wears the error class only once the image has actually failed", () => {
    render({ className: named });
    expect(rootEl().className).not.toContain("is-error");

    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(rootEl().className).toContain("is-error");
  });

  it("wears the text class only when the slide is not a content image", () => {
    render({ className: named });
    expect(rootEl().className).not.toContain("is-text");

    render({ className: named, slideData: TEXT, isContentImg: false });
    expect(rootEl().className).toContain("is-text");
  });

  it("wears the interactive class only when the click can actually happen", () => {
    // Both halves: a handler with interactivity off, and interactivity on with
    // no handler. Either alone would leave a cursor promising something that
    // does not happen.
    render({
      className: named,
      onSlideClick: () => {},
      isInteractiveOn: false,
    });
    expect(rootEl().className).not.toContain("is-interactive");

    render({ className: named, isInteractiveOn: true });
    expect(rootEl().className).not.toContain("is-interactive");

    render({ className: named, onSlideClick: () => {}, isInteractiveOn: true });
    expect(rootEl().className).toContain("is-interactive");
  });
});

describe("SlideItem — retrying a failed image", () => {
  it("retries a failure inside the band, and leaves an off-band one alone", () => {
    // The store owns backoff and the attempt cap; what SlideItem decides is
    // WHICH failures are worth retrying. Retrying off-band ones turns a
    // flaky network into a background request storm across the whole buffer.
    const retried: string[] = [];
    const originalRetry = store.requestRetry.bind(store);
    store.requestRetry = (url: string) => {
      retried.push(url);
      originalRetry(url);
    };

    render({ isActual: false });
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(retried).toEqual([]);

    render({ isActual: true });
    // The URL is the slide's `content` — the image module carries candidates,
    // not the source of truth for the address.
    expect(retried).toEqual([IMAGE.content]);
  });
});

describe("SlideItem — what the slow-load reveal is gated on", () => {
  it("marks a loading image, and stops marking it once it is there", () => {
    // The stylesheet fades a complete bitmap in instead of letting the
    // progressive stripe paint show. A mark that never clears leaves every
    // slide faded out for good.
    render();
    expect(img()!.getAttribute("data-awaiting-image")).toBe("true");

    act(() => {
      img()!.dispatchEvent(new Event("load"));
    });
    expect(img()!.getAttribute("data-awaiting-image")).toBeNull();
  });

  it("does not mark anything without the responsive module", () => {
    // No module, no responsive selection, no progressive-stripe problem to
    // hide — and the stylesheet that would fade it in is not there either.
    render({ isResponsiveImagesOn: false });
    expect(img()!.getAttribute("data-awaiting-image")).toBeNull();
  });
});

describe("SlideItem — when a sizes hint is worth sending", () => {
  it("sends it for a slide with candidates, and not for one without", () => {
    // `sizes` without `srcSet` or `<source>` is noise the browser ignores; the
    // gate is the presence of candidates, from EITHER source.
    render({ slideData: { ...IMAGE, image: undefined } });
    expect(img()!.getAttribute("sizes")).toBeNull();

    render({
      slideData: { ...IMAGE, image: { srcSet: "a.webp 480w" } },
    });
    expect(img()!.getAttribute("sizes")).toBe("400px");

    render(); // art direction via <source>, no srcSet of its own
    expect(img()!.getAttribute("sizes")).toBe("400px");
  });
});
