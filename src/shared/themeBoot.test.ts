// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyThemeBoot, themeBootHtml, type ThemeBootColors } from "./themeBoot";

const COLORS: ThemeBootColors = { light: "#bfd6f8", dark: "#0d1520" };
const KEY = "theme-mode";

const setMatchMedia = (prefersDark: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: prefersDark && query.includes("dark") }),
  );
};

const mountMetas = () => {
  document.head.innerHTML =
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${COLORS.light}" />` +
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${COLORS.dark}" />`;
};

const metaContents = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
    m.getAttribute("content"),
  );

beforeEach(() => {
  localStorage.clear();
  mountMetas();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.backgroundColor = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyThemeBoot", () => {
  it("auto mode resolves from the OS scheme and leaves the media-paired metas alone", () => {
    setMatchMedia(true);
    applyThemeBoot(COLORS, KEY);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.backgroundColor).toBe("rgb(13, 21, 32)");
    expect(metaContents()).toEqual([COLORS.light, COLORS.dark]);
  });

  it("an explicit stored choice overrides BOTH metas and wins over the OS scheme", () => {
    setMatchMedia(true);
    localStorage.setItem(KEY, "light");
    applyThemeBoot(COLORS, KEY);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.backgroundColor).toBe("rgb(191, 214, 248)");
    expect(metaContents()).toEqual([COLORS.light, COLORS.light]);
  });

  it("treats a corrupted stored value as auto (never leaks into data-theme)", () => {
    setMatchMedia(false);
    localStorage.setItem(KEY, "garbage-value");
    applyThemeBoot(COLORS, KEY);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(metaContents()).toEqual([COLORS.light, COLORS.dark]);
  });
});

describe("themeBootHtml", () => {
  it("emits both media-paired metas and a self-invoking script", () => {
    const html = themeBootHtml(COLORS, KEY);
    expect(html).toContain('media="(prefers-color-scheme: light)"');
    expect(html).toContain('media="(prefers-color-scheme: dark)"');
    expect(html).toContain(`content="${COLORS.light}"`);
    expect(html).toContain(`content="${COLORS.dark}"`);
    expect(html).toMatch(/<script>\(function applyThemeBoot/);
  });

  it("serialises a SELF-CONTAINED script: the extracted source runs standalone", () => {
    // The inline transport relies on Function.prototype.toString(): if the
    // implementation ever closes over an import or outer name, the serialised
    // copy breaks. Execute the extracted script body in isolation to prove
    // it does not.
    setMatchMedia(true);
    localStorage.setItem(KEY, "dark");
    const html = themeBootHtml(COLORS, KEY);
    const source = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
    // eslint-disable-next-line no-new-func
    new Function(source)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(metaContents()).toEqual([COLORS.dark, COLORS.dark]);
  });
});
