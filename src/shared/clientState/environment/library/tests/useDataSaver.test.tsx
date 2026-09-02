// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Fork of the same test in `useUserEnvironment/tests/`, repointed at THIS
 * copy of the hook. The two are duplicated by design and hold SEPARATE module
 * state — a guard on one says nothing about the other.
 *
 * The FIRST-FRAME data-saver signal — the sibling of the `useIsTouchDevice`
 * case, and the same failure class.
 *
 * `useSyncExternalStore` calls `getSnapshot` during render, BEFORE it
 * subscribes. Returning the module-level cached `false` there and reading
 * `prefers-reduced-data` / `navigator.connection.saveData` only inside
 * `subscribe()` makes the first render wrong. React re-renders once the
 * subscription lands, so an assertion on the FINAL value cannot see it — these
 * tests pin the FIRST render.
 *
 * It matters because the first frame is exactly where the off-band image fetch
 * policy is decided: a data-saving user would still be served the speculative
 * requests the flag exists to prevent.
 */

const installEnvironment = (options: {
  reducedData?: boolean;
  saveData?: boolean | undefined;
}) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      query === "(prefers-reduced-data: reduce)"
        ? Boolean(options.reducedData)
        : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  if (options.saveData === undefined) {
    // No Network Information API at all — the media query is the only signal.
    vi.stubGlobal("navigator", {});
    return;
  }
  vi.stubGlobal("navigator", {
    connection: {
      saveData: options.saveData,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
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
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Renders a probe and returns the value seen on each render, in order. */
const renderProbe = async (): Promise<boolean[]> => {
  // The hook holds its signals in module-level singleton state, so each case
  // needs a freshly evaluated module.
  vi.resetModules();
  const { useDataSaver } = await import("../useDataSaver");

  const seen: boolean[] = [];
  const Probe = () => {
    seen.push(useDataSaver());
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

describe("useDataSaver", () => {
  it("reports data-saver on the VERY FIRST render via prefers-reduced-data", async () => {
    installEnvironment({ reducedData: true, saveData: undefined });
    const seen = await renderProbe();
    expect(seen[0]).toBe(true);
  });

  it("reports data-saver on the VERY FIRST render via connection.saveData", async () => {
    installEnvironment({ reducedData: false, saveData: true });
    const seen = await renderProbe();
    expect(seen[0]).toBe(true);
  });

  it("reports it off on the first render when neither signal is set", async () => {
    installEnvironment({ reducedData: false, saveData: false });
    const seen = await renderProbe();
    expect(seen[0]).toBe(false);
  });
});

/** An environment whose two signals can be moved by the test. */
const installLiveEnvironment = (options: {
  reducedData?: boolean;
  saveData?: boolean | undefined;
}) => {
  const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
  const connectionListeners = new Set<() => void>();
  let reduced = Boolean(options.reducedData);
  const connection =
    options.saveData === undefined
      ? null
      : {
          saveData: options.saveData,
          addEventListener: (_type: string, listener: () => void) => {
            connectionListeners.add(listener);
          },
          removeEventListener: (_type: string, listener: () => void) => {
            connectionListeners.delete(listener);
          },
        };

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-data: reduce)" ? reduced : false;
    },
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      mediaListeners.delete(listener);
    },
  }));
  vi.stubGlobal("navigator", connection ? { connection } : {});

  return {
    mediaListenerCount: () => mediaListeners.size,
    connectionListenerCount: () => connectionListeners.size,
    /** Moves the signal WITHOUT telling anybody — a stale module, from the
     *  inside. */
    setReducedDataSilently(next: boolean) {
      reduced = next;
    },
    changeReducedData(next: boolean) {
      reduced = next;
      act(() => {
        for (const listener of [...mediaListeners])
          listener({ matches: next } as MediaQueryListEvent);
      });
    },
    changeSaveData(next: boolean) {
      if (connection) connection.saveData = next;
      act(() => {
        for (const listener of [...connectionListeners]) listener();
      });
    },
  };
};

/** Mounts `count` independent consumers of the same module-level store. */
const renderProbeWith = async (
  count: number,
  enabled = true,
): Promise<boolean[]> => {
  vi.resetModules();
  const { useDataSaver } = await import("../useDataSaver");

  const seen: boolean[] = [];
  const Probe = () => {
    seen.push(useDataSaver(enabled));
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

describe("useDataSaver — the signals after the first frame", () => {
  it("follows prefers-reduced-data when the user turns it on mid-session", async () => {
    const env = installLiveEnvironment({ reducedData: false, saveData: false });
    const seen = await renderProbeWith(1);
    expect(seen.at(-1)).toBe(false);

    env.changeReducedData(true);

    expect(seen.at(-1)).toBe(true);
  });

  it("follows the connection's saveData flag the same way", async () => {
    // Two independent signals, and EITHER is enough: a user on a metered
    // connection never touched the OS setting.
    const env = installLiveEnvironment({ reducedData: false, saveData: false });
    const seen = await renderProbeWith(1);
    expect(seen.at(-1)).toBe(false);

    env.changeSaveData(true);

    expect(seen.at(-1)).toBe(true);
  });

  it("survives a browser with no Network Information API", async () => {
    // `navigator.connection` is non-standard and absent in Safari and Firefox.
    // The media query is then the only signal, and reading the missing object
    // must not throw during a render.
    const env = installLiveEnvironment({
      reducedData: false,
      saveData: undefined,
    });
    const seen = await renderProbeWith(1);

    expect(seen.at(-1)).toBe(false);
    expect(env.connectionListenerCount()).toBe(0);

    env.changeReducedData(true);
    expect(seen.at(-1)).toBe(true);
  });
});

describe("useDataSaver — the consumer that opted out", () => {
  it("reads off and subscribes to nothing at all", async () => {
    // `enabled: false` is how a caller that has no use for the flag stays out
    // of the store entirely — Rules of Hooks forbid skipping the hook itself.
    // Subscribing anyway would attach the module's listeners for a consumer
    // that never reads them.
    const env = installLiveEnvironment({ reducedData: true, saveData: true });
    const seen = await renderProbeWith(1, false);

    expect(seen.at(-1)).toBe(false);
    expect(env.mediaListenerCount()).toBe(0);
    expect(env.connectionListenerCount()).toBe(0);
  });
});

describe("useDataSaver — the module state between consumers", () => {
  it("keeps every consumer on the SAME answer, whenever it joined", async () => {
    // The store re-reads the environment only when it wakes — that is, for the
    // FIRST consumer. Re-reading for a later one would refresh the module's
    // value without notifying anybody, and the newcomer would render a
    // different answer from the consumers already on the page: one carousel
    // fetching speculatively while its neighbour does not.
    const env = installLiveEnvironment({ reducedData: false, saveData: false });
    vi.resetModules();
    const { useDataSaver } = await import("../useDataSaver");

    const seen: boolean[] = [];
    const Probe = () => {
      seen.push(useDataSaver());
      return null;
    };
    const mountOne = () => {
      const node = document.createElement("div");
      document.body.appendChild(node);
      containers.push(node);
      const mounted = createRoot(node);
      roots.push(mounted);
      act(() => {
        mounted.render(<Probe />);
      });
    };

    mountOne();
    expect(seen.at(-1)).toBe(false);

    // The signal moves without firing its event, so nothing wakes the store.
    // A second consumer joining must not quietly refresh the module for
    // itself: it would render the new answer while the first still shows the
    // old one, and nothing would ever reconcile them.
    env.setReducedDataSilently(true);
    mountOne();

    expect(new Set(seen).size).toBe(1);
  });

  it("attaches once for many, holds while any is left, drops at the last", async () => {
    const env = installLiveEnvironment({ reducedData: false, saveData: false });
    const seen = await renderProbeWith(2);

    expect(env.mediaListenerCount()).toBe(1);
    expect(env.connectionListenerCount()).toBe(1);

    act(() => {
      roots[0]!.unmount();
    });
    // Still attached: the consumer still on the page has to keep hearing it.
    expect(env.mediaListenerCount()).toBe(1);
    env.changeReducedData(true);
    expect(seen.at(-1)).toBe(true);

    act(() => {
      roots[1]!.unmount();
    });
    expect(env.mediaListenerCount()).toBe(0);
    expect(env.connectionListenerCount()).toBe(0);
  });
});
