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
  disconnected = false;
  observed: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
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
}

const installObserver = () => vi.stubGlobal("IntersectionObserver", StubObserver);

const setTabVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

function Probe() {
  const elementRef = useRef<HTMLDivElement | null>(null);
  visible = useViewportVisibility({ elementRef, threshold: 0.2 });
  return <div ref={elementRef} />;
}

const render = () =>
  act(() => {
    root.render(<Probe />);
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
