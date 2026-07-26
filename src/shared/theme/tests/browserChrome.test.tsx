// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ThemeProvider } from "../ThemeProvider";
import { useTheme } from "../useTheme";
import { BROWSER_THEME_COLORS } from "../internal/colors";
import type { ThemeContextValue } from "../internal/types";

const installMatchMedia = () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

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
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
};

const htmlBg = () => document.documentElement.style.backgroundColor;
const metaContent = (media?: string) => {
  const metas = [...document.head.querySelectorAll('meta[name="theme-color"]')];
  const meta = media
    ? metas.find((m) => m.getAttribute("media")?.includes(media))
    : metas[0];
  return meta?.getAttribute("content");
};

// jsdom returns rgb(...) from style reads; compare by setting a probe.
const asRgb = (hex: string) => {
  const el = document.createElement("div");
  el.style.backgroundColor = hex;
  return el.style.backgroundColor;
};

beforeEach(() => {
  localStorage.clear();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.documentElement.removeAttribute("style");
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

describe("BrowserChromeSync (via the ThemeProvider facade)", () => {
  it("sets the inline <html> background to the on-screen color", () => {
    render(); // auto → light
    expect(htmlBg()).toBe(asRgb(BROWSER_THEME_COLORS.light));
    act(() => captured!.setTheme("dark"));
    expect(htmlBg()).toBe(asRgb(BROWSER_THEME_COLORS.dark));
  });

  it("creates a theme-color meta when the host has none", () => {
    render();
    expect(metaContent()).toBe(BROWSER_THEME_COLORS.light);
  });

  it("overrides both metas to the chosen color in an explicit mode", () => {
    const light = document.createElement("meta");
    light.setAttribute("name", "theme-color");
    light.setAttribute("media", "(prefers-color-scheme: light)");
    const dark = document.createElement("meta");
    dark.setAttribute("name", "theme-color");
    dark.setAttribute("media", "(prefers-color-scheme: dark)");
    document.head.append(light, dark);

    render();
    act(() => captured!.setTheme("dark"));
    expect(metaContent("light")).toBe(BROWSER_THEME_COLORS.dark);
    expect(metaContent("dark")).toBe(BROWSER_THEME_COLORS.dark);
  });

  it("keeps each meta on its own scheme color in auto mode", () => {
    const light = document.createElement("meta");
    light.setAttribute("name", "theme-color");
    light.setAttribute("media", "(prefers-color-scheme: light)");
    const dark = document.createElement("meta");
    dark.setAttribute("name", "theme-color");
    dark.setAttribute("media", "(prefers-color-scheme: dark)");
    document.head.append(light, dark);

    render(); // auto
    expect(metaContent("light")).toBe(BROWSER_THEME_COLORS.light);
    expect(metaContent("dark")).toBe(BROWSER_THEME_COLORS.dark);
  });
});
