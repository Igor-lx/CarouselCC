// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ThemeStateProvider } from "../internal/core/ThemeStateProvider";
import { useTheme } from "../internal/core/useTheme";
import { THEME_STORAGE_KEY } from "../internal/core/constants";
import type { ThemeContextValue } from "../internal/core/types";

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
