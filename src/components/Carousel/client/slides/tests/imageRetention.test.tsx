// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { IMAGE_RETRY } from "../../config";
import { buildSlideRecords } from "../../domain";
import type { CarouselSlideRecord } from "../../domain";
import type { Slide } from "../../public-api/types";
import { useImageResourceStore } from "../imageResource";
import type { ImageResourceStore } from "../imageResource";

/**
 * Retention prunes the resource store to the live deck. The rule it must obey:
 * prune by the SAME url the renderer keys on. Prune by a different one and it
 * evicts the entry for an image currently on screen — the slide's status resets
 * to `loading`, the veil comes back, and a loaded picture flickers for no
 * visible reason. Nothing throws, and it only happens after a data change.
 */

const slideOf = (id: string, content: string, defaultSrc?: string): Slide => ({
  id,
  content,
  ...(defaultSrc ? { image: { defaultSrc } } : {}),
});

let host: HTMLDivElement;
let root: Root;
let store: ImageResourceStore | null;

function Probe({
  records,
  isContentImg = true,
  isResponsiveImagesOn = true,
}: {
  records: CarouselSlideRecord[];
  isContentImg?: boolean;
  isResponsiveImagesOn?: boolean;
}) {
  store = useImageResourceStore({
    isContentImg,
    records,
    isResponsiveImagesOn,
  });
  return null;
}

const render = (props: {
  records: CarouselSlideRecord[];
  isContentImg?: boolean;
  isResponsiveImagesOn?: boolean;
}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const deckA = buildSlideRecords([
  slideOf("1", "https://x.test/a.webp", "https://x.test/a-default.webp"),
  slideOf("2", "https://x.test/b.webp"),
]);
const deckB = buildSlideRecords([slideOf("3", "https://x.test/c.webp")]);

beforeEach(() => {
  store = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useImageResourceStore — retention", () => {
  it("keeps the status of a url the deck still renders", () => {
    render({ records: deckA });
    act(() => store!.reportLoaded("https://x.test/a.webp"));
    expect(store!.getSnapshot("https://x.test/a.webp").status).toBe("loaded");

    // Same deck, a fresh array — what a parent re-render produces.
    render({ records: [...deckA] });
    expect(store!.getSnapshot("https://x.test/a.webp").status).toBe("loaded");
  });

  it("drops a url the deck no longer has", () => {
    render({ records: deckA });
    act(() => store!.reportLoaded("https://x.test/a.webp"));

    render({ records: deckB });
    // Unknown urls read as `loading`, the optimistic default.
    expect(store!.getSnapshot("https://x.test/a.webp").status).toBe("loading");
  });

  /**
   * The load-bearing one. With the responsive module off, the renderer draws
   * `image.defaultSrc`; with it on, it draws `content`. Retention has to follow
   * the same switch or it prunes exactly the entry being rendered.
   */
  it("follows the renderer's url rule when the responsive module is off", () => {
    render({ records: deckA, isResponsiveImagesOn: false });
    act(() => store!.reportLoaded("https://x.test/a-default.webp"));

    render({ records: [...deckA], isResponsiveImagesOn: false });
    expect(store!.getSnapshot("https://x.test/a-default.webp").status).toBe(
      "loaded",
    );
  });

  it("re-keys when the responsive module is switched at runtime", () => {
    render({ records: deckA, isResponsiveImagesOn: false });
    act(() => store!.reportLoaded("https://x.test/a-default.webp"));

    // Turning the module on changes which url is rendered, so the old entry is
    // genuinely dead and SHOULD go.
    render({ records: deckA, isResponsiveImagesOn: true });
    expect(store!.getSnapshot("https://x.test/a-default.webp").status).toBe(
      "loading",
    );
  });
});

describe("useImageResourceStore — the instance", () => {
  it("hands out one store for the carousel's life", () => {
    render({ records: deckA });
    const first = store;
    render({ records: deckB });
    expect(store).toBe(first);
  });

  it("has no store at all when the deck carries no images", () => {
    render({ records: deckA, isContentImg: false });
    expect(store).toBeNull();
  });

  it("comes back when image content is switched on again", () => {
    render({ records: deckA, isContentImg: true });
    const first = store;
    render({ records: deckA, isContentImg: false });
    expect(store).toBeNull();

    render({ records: deckA, isContentImg: true });
    // The instance is reused rather than rebuilt; a soft dispose, not a drop.
    expect(store).toBe(first);
  });

  it("clears its timers when image content goes away", () => {
    vi.useFakeTimers();
    try {
      render({ records: deckA });
      act(() => store!.reportError("https://x.test/a.webp"));
      act(() => store!.requestRetry("https://x.test/a.webp"));
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      render({ records: deckA, isContentImg: false });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useImageResourceStore — retention when there is nothing to retain", () => {
  it("keeps nothing at all once the deck stops being image content", () => {
    // `isContentImg` off means the renderer mounts no images, so every tracked
    // URL is dead weight: entries AND their pending retry timers.
    //
    // Two defences hold this and neither can be falsified alone — retention
    // collects no URLs, and the instance soft-disposes the store. Removing
    // both turns this case red, which is what makes it a test of the
    // guarantee rather than of one implementation of it.
    render({ records: deckA });
    const kept = store!;
    kept.reportLoaded("https://x.test/a.webp");
    expect(kept.getSnapshot("https://x.test/a.webp").status).toBe("loaded");

    // The instance is withheld from consumers, but the same store object is
    // still the one being pruned behind it.
    render({ records: deckA, isContentImg: false });

    expect(store).toBeNull();
    expect(kept.getSnapshot("https://x.test/a.webp").status).toBe("loading");
  });
});

describe("useImageResourceStore — letting the store go", () => {
  it("disposes the store when the carousel unmounts", () => {
    // The store owns entries and `setTimeout` handles for the carousel's
    // lifetime. After the deck is gone they are simply a leak — and a pending
    // retry would go on firing into a tree that is no longer on the page.
    //
    // Asserted through an ERROR rather than a pending retry: both a disposed
    // store and a leaked timer end up reading `loading`, so a retry cannot
    // tell them apart. An emptied store reads an errored URL as untracked.
    vi.useFakeTimers();
    render({ records: deckA });
    const owned = store!;
    owned.reportError("https://x.test/a.webp");
    owned.requestRetry("https://x.test/a.webp");
    expect(owned.getSnapshot("https://x.test/a.webp").status).toBe("error");

    act(() => root.unmount());
    root = createRoot(host);

    expect(owned.getSnapshot("https://x.test/a.webp").status).toBe("loading");
    vi.advanceTimersByTime(IMAGE_RETRY.maxDelayMs);
    vi.useRealTimers();
  });
});
