// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Fork of the same test in `library/tests/`, repointed at THIS copy of the
 * hook. The two are duplicated by design and hold SEPARATE module state — a
 * guard on one says nothing about the other.
 *
 * The FIRST-FRAME touch signal.
 *
 * `useSyncExternalStore` calls `getSnapshot` during render, BEFORE it
 * subscribes. Returning a module-level cached `false` there and reading
 * `matchMedia` only inside `subscribe` makes the first render on every phone
 * report "not a touch device". React re-renders once the subscription lands,
 * which hides that from any assertion on the FINAL value — hence these tests
 * pin the value of the first render specifically.
 *
 * The consequence is not cosmetic: a consumer that latches the first value
 * (`useState(isTouch)`) can never resync, and a touch device is left with the
 * wrong pagination module for the session.
 */

const installMatchMedia = (coarse: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let roots: Root[] = [];
let containers: HTMLDivElement[] = [];

afterEach(() => {
  if (root && container) {
    act(() => {
      root!.unmount();
    });
    container.remove();
  }
  root = null;
  container = null;
  for (const extra of roots) act(() => extra.unmount());
  for (const node of containers) node.remove();
  roots = [];
  containers = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Mounts `count` independent consumers of the same module-level store. */
const renderProbeWith = async (count: number): Promise<boolean[]> => {
  vi.resetModules();
  const { useIsTouchDevice } = await import("../internal/useIsTouchDevice");

  const seen: boolean[] = [];
  const Probe = () => {
    seen.push(useIsTouchDevice());
    return null;
  };

  for (let index = 0; index < count; index += 1) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    containers.push(node);
    const mounted = createRoot(node);
    roots.push(mounted);
    act(() => {
      mounted.render(<Probe />);
    });
  }
  return seen;
};

/** Renders a probe and returns the value seen on each render, in order. */
const renderProbe = async (): Promise<boolean[]> => {
  // The hook holds its signal in module-level singleton state, so each case
  // needs a freshly evaluated module.
  vi.resetModules();
  const { useIsTouchDevice } = await import("../internal/useIsTouchDevice");

  const seen: boolean[] = [];
  const Probe = () => {
    seen.push(useIsTouchDevice());
    return null;
  };

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Probe />);
  });
  return seen;
};

describe("useIsTouchDevice", () => {
  it("reports touch on the VERY FIRST render of a coarse-pointer device", async () => {
    installMatchMedia(true);
    const seen = await renderProbe();
    expect(seen[0]).toBe(true);
  });

  it("reports no touch on the first render of a fine-pointer device", async () => {
    installMatchMedia(false);
    const seen = await renderProbe();
    expect(seen[0]).toBe(false);
  });
});

/** A `matchMedia` whose `change` listeners can be fired by the test. */
const installLiveMatchMedia = (coarse: boolean) => {
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = coarse;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(pointer: coarse)" ? matches : false;
    },
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      changeListeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      changeListeners.delete(listener);
    },
  }));
  return {
    listenerCount: () => changeListeners.size,
    change(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of [...changeListeners])
          listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
};

/** Counts the window-level `pointerdown` listeners the module holds. */
const watchWindowListeners = () => {
  let attached = 0;
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "pointerdown") attached += 1;
      add(type, listener, options);
    },
  );
  vi.spyOn(window, "removeEventListener").mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "pointerdown") attached -= 1;
      remove(type, listener, options);
    },
  );
  return { count: () => attached };
};

const touchDown = () =>
  act(() => {
    const event = new MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    window.dispatchEvent(event);
  });

const mouseDown = () =>
  act(() => {
    const event = new MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    window.dispatchEvent(event);
  });

describe("useIsTouchDevice — the signal after the first frame", () => {
  it("follows the pointer media query when it changes", async () => {
    // A tablet docked to a mouse, or a phone in a desktop-mode window: the
    // pointer type genuinely changes under a live page.
    const media = installLiveMatchMedia(false);
    const seen = await renderProbe();
    expect(seen.at(-1)).toBe(false);

    media.change(true);
    expect(seen.at(-1)).toBe(true);
  });

  it("says nothing when the query fires without actually changing", async () => {
    // The event can repeat. Re-notifying on it re-renders every consumer of a
    // signal that did not move.
    const media = installLiveMatchMedia(true);
    const seen = await renderProbe();
    const renders = seen.length;

    media.change(true);

    expect(seen.length).toBe(renders);
  });

  it("upgrades a fine-pointer device the moment a finger arrives", async () => {
    // Hybrid laptops report `(pointer: coarse)` false while a touchscreen sits
    // right there. The media query never corrects itself — the touch does.
    installLiveMatchMedia(false);
    const seen = await renderProbe();
    expect(seen.at(-1)).toBe(false);

    touchDown();

    expect(seen.at(-1)).toBe(true);
  });

  it("is not fooled by a mouse", async () => {
    installLiveMatchMedia(false);
    const seen = await renderProbe();

    mouseDown();

    expect(seen.at(-1)).toBe(false);
  });

  it("stops listening for the finger once it has seen one", async () => {
    // The upgrade is one-way and one-shot: keeping the listener would run a
    // handler on every touch for the life of the page, for a value that can no
    // longer change. Counted at the WINDOW, because an extra notify is
    // invisible in renders — `useSyncExternalStore` compares snapshots itself
    // and swallows one that did not move.
    installLiveMatchMedia(false);
    const listeners = watchWindowListeners();
    const seen = await renderProbe();
    expect(listeners.count()).toBe(1);

    touchDown();

    expect(seen.at(-1)).toBe(true);
    expect(listeners.count()).toBe(0);
  });

  it("does not watch for a finger on a device that already reports touch", async () => {
    // Nothing to upgrade: attaching the listener anyway puts a handler on
    // every touch of every phone.
    installLiveMatchMedia(true);
    const listeners = watchWindowListeners();
    const seen = await renderProbe();

    expect(seen.at(-1)).toBe(true);
    expect(listeners.count()).toBe(0);
  });
});

describe("useIsTouchDevice — the module state between consumers", () => {
  it("holds its listeners while ANY consumer is left, and drops them at the last", async () => {
    // The store is module-level and shared: tearing down on the first consumer
    // to leave would silently stop updating the ones still on the page, and
    // leaving them attached after the last outlives every carousel.
    const media = installLiveMatchMedia(false);
    const listeners = watchWindowListeners();
    const seen = await renderProbeWith(2);
    // One attachment for the module, not one per consumer: the store is shared
    // and the work of watching is done once.
    expect(media.listenerCount()).toBe(1);
    expect(listeners.count()).toBe(1);

    act(() => {
      roots[0]!.unmount();
    });
    expect(media.listenerCount()).toBe(1);

    // The survivor still hears the signal.
    media.change(true);
    expect(seen.at(-1)).toBe(true);

    act(() => {
      roots[1]!.unmount();
    });
    expect(media.listenerCount()).toBe(0);
  });
});
