// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Regression test for the FIRST-FRAME data-saver signal — the sibling of the
 * `useIsTouchDevice` case, and the same defect class.
 *
 * `useSyncExternalStore` calls `getSnapshot` during render, BEFORE it
 * subscribes. The hook used to return the module-level cached `false` there and
 * read `prefers-reduced-data` / `navigator.connection.saveData` only inside
 * `subscribe()`. React re-renders once the subscription lands, so an assertion
 * on the FINAL value cannot see the defect — these tests pin the FIRST render.
 *
 * It mattered because the first frame is exactly where the off-band image fetch
 * policy is decided: a data-saving user could still be served the speculative
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

afterEach(() => {
  if (root && container) {
    act(() => {
      root!.unmount();
    });
    container.remove();
  }
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Renders a probe and returns the value seen on each render, in order. */
const renderProbe = async (): Promise<boolean[]> => {
  // The hook holds its signals in module-level singleton state, so each case
  // needs a freshly evaluated module.
  vi.resetModules();
  const { useDataSaver } = await import("../internal/useDataSaver");

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
