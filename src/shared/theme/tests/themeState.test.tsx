// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ThemeStateProvider } from "../ThemeStateProvider";
import { useTheme } from "../useTheme";
import { THEME_STORAGE_KEY } from "../internal/constants";
import type { ThemeContextValue } from "../internal/types";

let osDark = false;
const mqlListeners = new Set<() => void>();

const installMatchMedia = () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("dark") ? osDark : false;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => mqlListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => mqlListeners.delete(cb),
  }));
};

const setOsDark = (dark: boolean) =>
  act(() => {
    osDark = dark;
    mqlListeners.forEach((cb) => cb());
  });

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let captured: ThemeContextValue | null = null;

const Probe = () => {
  captured = useTheme();
  return null;
};

const render = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ThemeStateProvider>
        <Probe />
      </ThemeStateProvider>,
    );
  });
};

const dataTheme = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  localStorage.clear();
  osDark = false;
  mqlListeners.clear();
  document.documentElement.removeAttribute("data-theme");
  installMatchMedia();
});

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount());
    container.remove();
  }
  root = null;
  container = null;
  captured = null;
  vi.unstubAllGlobals();
});

describe("ThemeStateProvider", () => {
  it("defaults to auto and resolves the on-screen look from the OS", () => {
    render();
    expect(captured!.theme).toBe("auto");
    expect(captured!.onScreenTheme).toBe("light");
    expect(dataTheme()).toBe("light");
  });

  it("resolves auto to dark when the OS prefers dark", () => {
    osDark = true;
    render();
    expect(captured!.onScreenTheme).toBe("dark");
    expect(dataTheme()).toBe("dark");
  });

  it("honours an explicit stored mode", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render();
    expect(captured!.theme).toBe("dark");
    expect(captured!.onScreenTheme).toBe("dark");
  });

  it("falls back to auto on a corrupted stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "garbage");
    render();
    expect(captured!.theme).toBe("auto");
  });

  it("toggleTheme flips the on-screen look and commits an explicit mode", () => {
    render(); // auto → light
    act(() => captured!.toggleTheme());
    expect(captured!.theme).toBe("dark");
    expect(dataTheme()).toBe("dark");
  });

  it("persists the mode to localStorage", () => {
    render();
    act(() => captured!.setTheme("dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("tracks live OS changes while in auto", () => {
    render(); // auto → light
    setOsDark(true);
    expect(captured!.onScreenTheme).toBe("dark");
    expect(dataTheme()).toBe("dark");
  });

  it("stops tracking the OS once the user has chosen a mode", () => {
    // The listener is attached ONLY in auto. Left attached, an OS switch would
    // override a deliberate choice — the setting would look like it silently
    // stopped working.
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render();
    expect(captured!.onScreenTheme).toBe("light");
    expect(mqlListeners.size).toBe(0);

    setOsDark(true);
    expect(captured!.onScreenTheme).toBe("light");
    expect(dataTheme()).toBe("light");
  });

  it("lets go of the OS listener when it stops being needed", () => {
    // Auto → explicit while mounted: the subscription has to come off with the
    // effect that made it, or it accumulates one per mode change.
    render();
    expect(mqlListeners.size).toBe(1);

    act(() => captured!.setTheme("dark"));

    expect(mqlListeners.size).toBe(0);
  });

  it("ignores a storage event about somebody else's key", () => {
    // `storage` fires for EVERY key the origin holds. Reading them all makes
    // any other app on the same origin able to repaint this one.
    render();
    const before = captured!.theme;

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "unrelated", newValue: "dark" }),
      );
    });

    expect(captured!.theme).toBe(before);
  });

  // The `storage` listener's removal on unmount is deliberately NOT asserted:
  // React swallows a `setState` on an unmounted component, so a leaked
  // listener changes nothing any test can observe. The OS listener above IS
  // observable, because it is counted at the MediaQueryList.

  it("syncs across tabs via the storage event", () => {
    render();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: "dark",
        }),
      );
    });
    expect(captured!.theme).toBe("dark");
  });
});
