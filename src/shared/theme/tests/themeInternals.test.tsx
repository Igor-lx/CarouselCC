// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { THEME_MODES, THEME_STORAGE_KEY } from "../internal/constants";
import { asThemeMode, prefersDark, resolveOnScreen } from "../internal/resolve";
import { readStoredMode, writeStoredMode } from "../internal/storage";
import { ThemeContext } from "../internal/ThemeContext";
import { useTheme } from "../useTheme";

/**
 * The three small pieces the theme is built from, none of which had a test of
 * their own: the parser that turns untrusted storage into a mode, the OS
 * preference read that has to survive a server and a browser without
 * `matchMedia`, and the storage wrapper that must never throw.
 *
 * The theme is applied before hydration, so a throw here does not degrade a
 * feature — it takes the page down before anything is on screen.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("asThemeMode — untrusted input becomes a known mode", () => {
  it("keeps each of the three modes it recognises", () => {
    for (const mode of Object.values(THEME_MODES)) {
      expect(asThemeMode(mode)).toBe(mode);
    }
  });

  it("falls back to AUTO for anything else, including nothing at all", () => {
    // The value comes out of `localStorage`, which any script on the page may
    // have written. An unrecognised string must not reach the DOM as a
    // `data-theme`, and the honest default is "follow the system".
    for (const raw of [null, "", "Light", "dark ", "sepia", "{}"]) {
      expect(asThemeMode(raw)).toBe(THEME_MODES.AUTO);
    }
  });
});

describe("prefersDark — the OS preference, guarded", () => {
  it("reports what the media query says", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(prefersDark()).toBe(true);

    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(prefersDark()).toBe(false);
  });

  it("answers light on a browser with no matchMedia at all", () => {
    // Old browsers and jsdom-like runtimes. Calling it blindly throws during
    // the very first render, before a single pixel is on screen.
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersDark()).toBe(false);
  });
});

describe("resolveOnScreen — what actually gets painted", () => {
  it("follows the system only in AUTO", () => {
    expect(resolveOnScreen(THEME_MODES.AUTO, true)).toBe("dark");
    expect(resolveOnScreen(THEME_MODES.AUTO, false)).toBe("light");
  });

  it("ignores the system once the user has chosen", () => {
    // A deliberate choice outranks the OS: that is the whole point of having
    // a stored mode at all.
    expect(resolveOnScreen(THEME_MODES.LIGHT, true)).toBe("light");
    expect(resolveOnScreen(THEME_MODES.DARK, false)).toBe("dark");
  });
});

describe("theme storage — best effort, never a crash", () => {
  it("round-trips a stored mode", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });

    writeStoredMode(THEME_MODES.DARK);
    expect(store.get(THEME_STORAGE_KEY)).toBe(THEME_MODES.DARK);
    expect(readStoredMode()).toBe(THEME_MODES.DARK);
  });

  it("reads AUTO when there is no storage at all", () => {
    // SSR: `globalThis.localStorage` is simply absent.
    vi.stubGlobal("localStorage", undefined);
    expect(readStoredMode()).toBe(THEME_MODES.AUTO);
    expect(() => writeStoredMode(THEME_MODES.DARK)).not.toThrow();
  });

  it("survives storage that THROWS rather than being absent", () => {
    // Private mode and disabled-cookie settings throw on access rather than
    // returning null — the case a truthiness check alone does not cover.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    expect(readStoredMode()).toBe(THEME_MODES.AUTO);
    expect(() => writeStoredMode(THEME_MODES.DARK)).not.toThrow();
  });
});

describe("useTheme — the provider it demands", () => {
  it("hands back the context when there is one", () => {
    let seen: unknown = null;
    const value = { theme: THEME_MODES.DARK } as never;
    const Probe = () => {
      seen = useTheme();
      return null;
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() =>
      root.render(
        <ThemeContext.Provider value={value}>
          <Probe />
        </ThemeContext.Provider>,
      ),
    );

    expect(seen).toBe(value);
    act(() => root.unmount());
    host.remove();
  });

  it("throws a named error instead of handing out nothing", () => {
    // Without the provider the context is `null`, and every consumer would
    // fail somewhere further down on a property of `null`. The named throw is
    // what turns that into a message pointing at the actual mistake.
    const Probe = () => {
      useTheme();
      return null;
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => act(() => root.render(<Probe />))).toThrow(
      /must be used within a ThemeProvider/,
    );

    consoleError.mockRestore();
    host.remove();
  });
});
