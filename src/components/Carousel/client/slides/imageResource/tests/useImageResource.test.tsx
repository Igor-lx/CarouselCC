// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createImageResourceStore } from "../createImageResourceStore";
import {
  useImageResource,
  type ImageResourceHandle,
} from "../useImageResource";
import type { ImageResourceStore } from "../types";

/**
 * One slide's view of the shared store — and the branch that says a slide is
 * not a tracked resource at all.
 *
 * That branch is the load-bearing one and it had no test: a text slide, or any
 * slide rendered with the store switched off, must read as ALREADY LOADED.
 * Read it as `loading` instead and every text slide in the deck wears the
 * slow-load treatment for good; wire its callbacks to a store that is not
 * there and a load event throws on the first paint.
 *
 * The other half is a perf claim the hook makes in a comment: the callbacks
 * stay the same functions across a status change, so a memoised `SlideItem`
 * does not re-render each time an image somewhere reports in.
 */

const URL_A = "https://example.test/a.webp";
const URL_B = "https://example.test/b.webp";

let host: HTMLDivElement;
let root: Root;
let store: ImageResourceStore;
let handle: ImageResourceHandle;

function Probe({
  url,
  withStore = true,
}: {
  url: string | null;
  withStore?: boolean;
}) {
  handle = useImageResource(url, withStore ? store : null);
  return null;
}

const render = (url: string | null, withStore = true) =>
  act(() => {
    root.render(<Probe url={url} withStore={withStore} />);
  });

beforeEach(() => {
  store = createImageResourceStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  store.dispose();
});

describe("a slide that is not a tracked resource", () => {
  it("reads as already loaded, not as loading", () => {
    // A text slide has no image to wait for. Reporting `loading` would leave
    // it wearing the slow-load fade for the life of the carousel.
    render(null);

    expect(handle.status).toBe("loaded");
    expect(handle.generation).toBe(0);
  });

  it("reads the same way when the store itself is switched off", () => {
    // Both halves of the guard matter: a URL with no store is just as
    // untracked as a store with no URL.
    render(URL_A, false);

    expect(handle.status).toBe("loaded");
  });

  it("hands out callbacks that do nothing, rather than callbacks that throw", () => {
    render(null);

    expect(() => {
      handle.reportLoaded();
      handle.reportError();
      handle.requestRetry();
    }).not.toThrow();
    // And nothing reached the store under another name.
    expect(store.getSnapshot(URL_A).status).toBe("loading");
  });
});

describe("a slide that IS a tracked resource", () => {
  it("follows the store's snapshot for its own URL", () => {
    render(URL_A);
    expect(handle.status).toBe("loading");

    act(() => store.reportLoaded(URL_A));
    expect(handle.status).toBe("loaded");

    // A different URL's news is not this slide's.
    act(() => store.reportError(URL_B));
    expect(handle.status).toBe("loaded");
  });

  it("routes its reports to the store under its own URL", () => {
    render(URL_A);

    act(() => handle.reportError());

    expect(store.getSnapshot(URL_A).status).toBe("error");
    expect(store.getSnapshot(URL_B).status).toBe("loading");
  });

  it("re-subscribes when the slide's URL changes under it", () => {
    render(URL_A);
    render(URL_B);

    act(() => store.reportLoaded(URL_A));
    expect(handle.status).toBe("loading"); // still watching B

    act(() => store.reportLoaded(URL_B));
    expect(handle.status).toBe("loaded");
  });

  it("keeps the same callbacks across a status change", () => {
    // The claim the memo exists for: a `SlideItem` memoised on its props must
    // not re-render because some other image reported in. Only the store and
    // the URL may move these.
    render(URL_A);
    const before = handle.reportLoaded;

    act(() => store.reportError(URL_A));
    expect(handle.status).toBe("error");
    expect(handle.reportLoaded).toBe(before);

    render(URL_B);
    expect(handle.reportLoaded).not.toBe(before);
  });
});
