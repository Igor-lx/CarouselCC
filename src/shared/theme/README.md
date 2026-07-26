# Theme

A small light / dark / **auto** theme box. It persists the user's choice, drives
`data-theme` on `<html>`, and (optionally) keeps the mobile browser-chrome tint
(the address / status bar) in sync — including the tricky pre-paint window on a
cold mobile load.

> Import paths below are shown as `.../shared/theme`. This repo has no `@` path
> alias, so from a file use the relative path (e.g. `./shared/theme`,
> `../shared/theme`); a host with an alias can map it however it likes.

## Structure

Two responsibilities behind one facade:

- **`internal/core/`** — the portable, SSR-safe theme STATE: the mode, the
  resolved on-screen look, persistence, cross-tab sync, and `data-theme`. No
  browser-chrome knowledge; works in any app.
- **`internal/chrome/`** — the app-shell adapter that makes the mobile browser
  chrome match: the `theme-color` metas and the inline `<html>` background.
- **`ThemeProvider.tsx`** — the facade composing both. `ThemeStateProvider`
  (core only) is exported too, for hosts that don't want the chrome sync.

## Two concepts

- **`theme`** — the MODE the user picked: `"light"`, `"dark"`, or `"auto"`.
  `auto` follows the OS `prefers-color-scheme` live.
- **`onScreenTheme`** — the RESOLVED look currently showing: `"light"` or
  `"dark"` (never `auto`).

---

# Setup — pick a mode

## Mode A — full box (theme state + mobile chrome)

Use this when you want the mobile browser bar to match the theme.

**1. Wrap the root** in `<ThemeProvider>` (once):

```tsx
import { ThemeProvider } from ".../shared/theme";

<ThemeProvider>
  <App />
</ThemeProvider>
```

**2. Read the theme** from any descendant:

```tsx
import { useTheme } from ".../shared/theme";

const { theme, onScreenTheme, setTheme, toggleTheme } = useTheme();

<button onClick={toggleTheme}>{onScreenTheme === "dark" ? "🌙" : "☀️"}</button>
<button onClick={() => setTheme("auto")}>Auto</button>
```

**3. Style by the attribute** — CSS keys off `<html data-theme>`:

```scss
:root { /* light defaults */ }
:root[data-theme="dark"] {
  color-scheme: dark; /* dark tokens… */
}
```

**4. Add the pre-paint boot snippet to `index.html`.** On a cold mobile load the
browser commits the bar tint at the FIRST paint, before the bundle runs — so this
inline script (which cannot `import`) seeds `data-theme`, the `<html>` background,
and the bar color during head parsing. Paste it into `<head>`:

```html
<!-- theme boot — mirrors the theme box; kept in sync by bootSync.test.ts -->
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#bfd6f8" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d1520" />
<script>
  (() => {
    const COLORS = { light: "#bfd6f8", dark: "#0d1520" };
    const STORAGE_KEY = "theme-mode";

    let mode = "auto";
    try {
      mode = localStorage.getItem(STORAGE_KEY) || "auto";
    } catch {
      /* storage unavailable -> auto */
    }
    // Validate: anything but an explicit choice is auto.
    const isExplicit = mode === "light" || mode === "dark";
    const theme = isExplicit
      ? mode
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.backgroundColor = COLORS[theme]; // chrome samples the <html> bg pre-stylesheet
    if (isExplicit) {
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute("content", COLORS[theme]));
    }
  })();
</script>
```

The `COLORS` and `STORAGE_KEY` above DUPLICATE the box on purpose (the script
can't import). They are locked by [`tests/bootSync.test.ts`](./tests/bootSync.test.ts),
which reads `index.html` and fails CI on any drift — **so if you change a theme
color or the storage key in the box, update this snippet too.** Colors live in
[`internal/chrome/colors.ts`](./internal/chrome/colors.ts), the key in
[`internal/core/constants.ts`](./internal/core/constants.ts).

> Skipping step 4 is allowed: the theme still works, only the very first paint on
> mobile may flash the default bar color.

## Mode B — core only (no mobile chrome)

Use this for SSR, desktop-only, or an embedded widget — anywhere the mobile bar
tint is irrelevant. It touches only `data-theme` + `localStorage`.

**1. Wrap the root** in `<ThemeStateProvider>`:

```tsx
import { ThemeStateProvider } from ".../shared/theme";

<ThemeStateProvider>
  <App />
</ThemeStateProvider>
```

**2. Read the theme** — same `useTheme()` as Mode A step 2.

**3. Style by `data-theme`** — same CSS as Mode A step 3.

That's it: no `index.html` snippet, no `theme-color` metas, no boot-sync test —
this mode never touches the browser chrome.

## At a glance

| | `ThemeProvider` (full) | `ThemeStateProvider` (core) |
| --- | --- | --- |
| `data-theme` + `useTheme` + persist + cross-tab | ✅ | ✅ |
| mobile bar (`theme-color` + `<html>` bg) | ✅ | ❌ |
| needs the `index.html` snippet | yes (for a clean cold start) | no |
| SSR-safe | ✅ | ✅ |

Both wrap the root once; nesting is unnecessary. `useTheme()` throws if used
outside a provider.

---

## What `useTheme()` outputs

| field | type | meaning |
| --- | --- | --- |
| `theme` | `"light" \| "dark" \| "auto"` | the picked mode |
| `onScreenTheme` | `"light" \| "dark"` | the resolved look |
| `setTheme(mode)` | `(ThemeMode) => void` | set the mode explicitly |
| `toggleTheme()` | `() => void` | flip the on-screen look (commits an explicit mode; from `auto` you return via `setTheme("auto")`) |

## The storage key

`THEME_STORAGE_KEY = "theme-mode"` is the `localStorage` key the picked mode is
saved under. It is written on change and read on boot, synced **cross-tab** via
the `storage` event, **validated** (anything but `light`/`dark`/`auto` → `auto`),
and **safe** — absent (SSR) or throwing (privacy mode) storage never crashes the
provider.

## SSR note

`core/` is SSR-safe (guarded `localStorage` / `matchMedia`, isomorphic layout
effect). `chrome/` touches `document` in effects only, so it no-ops during server
render; the hydrated mobile bar tint is seeded by the boot snippet (Mode A).
