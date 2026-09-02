// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useViewportVisibility } from "../useViewportVisibility";

/**
 * "On screen" is the AND of two independent signals: the element intersects
 * the viewport, and the tab itself is in front. Consumers gate real work on it
 * (the carousel stops autoplaying), so a wrong answer is either wasted battery
 * or a feature that silently never runs.
 *
 * The degradation matters as much as the happy path: building the
 * IntersectionObserver unconditionally makes the layout effect throw on a
 * platform without the API, taking the whole host tree down with it.
 */

let host: HTMLDivElement;
let root: Root;
let visible: boolean;
let observers: StubObserver[];

class StubObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  disconnected = false;
  observed: Element[] = [];

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Drive the observer the way the browser would. */
  fire(isIntersecting: boolean): void {
    act(() => {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    });
  }

  /** The spec allows an empty batch. */
  fireEmpty(): void {
    act(() => {
      this.callback([], this as unknown as IntersectionObserver);
    });
  }
}

const installObserver = () =>
  vi.stubGlobal("IntersectionObserver", StubObserver);

const setTabVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

function Probe({
  threshold = 0.2,
  withElement = true,
}: {
  threshold?: number;
  withElement?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  visible = useViewportVisibility({ elementRef, threshold });
  return withElement ? <div ref={elementRef} /> : null;
}

const render = (props: { threshold?: number; withElement?: boolean } = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

beforeEach(() => {
  observers = [];
  setTabVisibility("visible");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("useViewportVisibility — with an observer", () => {
  beforeEach(installObserver);

  it("starts hidden until the observer has actually reported", () => {
    render();
    expect(visible).toBe(false);
  });

  it("turns visible when the element enters the viewport", () => {
    render();
    observers[0]!.fire(true);
    expect(visible).toBe(true);
  });

  it("turns hidden again when it leaves", () => {
    render();
    observers[0]!.fire(true);
    observers[0]!.fire(false);
    expect(visible).toBe(false);
  });

  it("counts a backgrounded tab as hidden even while on screen", () => {
    render();
    observers[0]!.fire(true);
    expect(visible).toBe(true);

    setTabVisibility("hidden");
    expect(visible).toBe(false);
  });

  it("comes back when the tab returns, without a new intersection event", () => {
    render();
    observers[0]!.fire(true);
    setTabVisibility("hidden");
    setTabVisibility("visible");
    expect(visible).toBe(true);
  });

  it("stays hidden on a backgrounded tab that also scrolls into view", () => {
    render();
    setTabVisibility("hidden");
    observers[0]!.fire(true);
    expect(visible).toBe(false);
  });

  it("observes the element it was given, exactly once", () => {
    render();
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed).toHaveLength(1);
  });

  it("disconnects on unmount", () => {
    render();
    act(() => root.unmount());
    root = createRoot(host);
    expect(observers[0]!.disconnected).toBe(true);
  });
});

describe("useViewportVisibility — without an observer", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", undefined);
  });

  it("mounts instead of throwing the host tree down", () => {
    expect(() => render()).not.toThrow();
  });

  /**
   * Degrading to "always on screen" costs a consumer some off-screen work.
   * Degrading to "never on screen" would disable it for good — autoplay that
   * never ticks, with nothing in the console to explain why.
   */
  it("assumes the element is on screen rather than never showing it", () => {
    render();
    expect(visible).toBe(true);
  });

  it("still honours the tab signal, which needs no observer", () => {
    render();
    setTabVisibility("hidden");
    expect(visible).toBe(false);

    setTabVisibility("visible");
    expect(visible).toBe(true);
  });
});

describe("useViewportVisibility — the details of the watching", () => {
  beforeEach(installObserver);

  it("hands the observer the threshold it was asked for", () => {
    // The threshold decides how much of a slide counts as on screen. Dropping
    // it falls back to the browser's default of 0 — a single pixel of the
    // element makes it "visible", and off-screen work starts a page early.
    render({ threshold: 0.75 });

    expect(observers[0]!.options?.threshold).toBe(0.75);
  });

  it("survives a notification that carries no entry", () => {
    // Reading `[0].isIntersecting` blindly throws inside an observer callback,
    // where nothing catches it — the element then stops being observed for the
    // rest of the session.
    render();
    observers[0]!.fire(true);
    expect(visible).toBe(true);

    const blown: string[] = [];
    const onError = (event: ErrorEvent) => blown.push(event.message);
    window.addEventListener("error", onError);
    observers[0]!.fireEmpty();
    window.removeEventListener("error", onError);

    expect(blown).toEqual([]);
    // No entry means nothing is known to be on screen.
    expect(visible).toBe(false);
  });

  it("stops listening for the tab signal on unmount", () => {
    // The observer is disconnected in the same teardown; this listener lives
    // on `document` and would otherwise outlive the component, calling
    // `setState` on a tree that is gone.
    render();
    observers[0]!.fire(true);
    expect(visible).toBe(true);

    act(() => root.unmount());
    root = createRoot(host);

    expect(() => setTabVisibility("hidden")).not.toThrow();
    expect(visible).toBe(true); // nothing wrote to it after the unmount
  });

  it("watches nothing at all until there is an element to watch", () => {
    // The ref is empty on the very first layout effect of a subtree that
    // renders nothing yet. Observing `null` throws.
    render({ withElement: false });

    expect(observers).toEqual([]);
    expect(visible).toBe(false);
  });
});
