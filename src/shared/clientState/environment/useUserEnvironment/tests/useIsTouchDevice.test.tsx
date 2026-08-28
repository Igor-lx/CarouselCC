// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
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
