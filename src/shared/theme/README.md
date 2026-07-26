# Theme

A small light / dark / **auto** theme box. It persists the user's choice, drives
`data-theme` on `<html>`, and keeps the mobile browser-chrome tint (the
address/status bar) in sync — including the tricky pre-paint window on a cold
mobile load. Turnkey: one `<ThemeProvider>` gives the full package.

## Structure

The box is split into two responsibilities behind one facade:

- **`internal/core/`** — the portable, SSR-safe theme STATE: the mode, the
  resolved on-screen look, persistence, cross-tab sync, and `data-theme`. No
  browser-chrome knowledge; works in any app.
- **`internal/chrome/`** — the app-shell adapter that makes the mobile browser
  chrome match: the `theme-color` metas and the inline `<html>` background.
- **`ThemeProvider.tsx`** — the facade that composes both. `ThemeStateProvider`
  (core only) is also exported for hosts that don't want the chrome sync.

## Two concepts

- **`theme`** — the MODE the user picked: `"light"`, `"dark"`, or `"auto"`.
  `auto` follows the OS `prefers-color-scheme` live.
- **`onScreenTheme`** — the RESOLVED look currently showing: `"light"` or
  `"dark"` (never `auto`).

## What it drives

On every change:

- **`data-theme` on `<html>`** (`"light" | "dark"`) — the stylesheet keys off it
  (`:root[data-theme="dark"]` …). Owned by **core**.
- **The inline `<html>` background-color.** Looks redundant with the stylesheet
  but is NOT: mobile chrome samples the `<html>` background, and the inline value
  (first set pre-paint by the boot script) outranks the stylesheet. **Removing it
  reintroduces white bars on theme change** on mobile. Owned by **chrome**.
- **The `theme-color` meta tags.** Two media-paired metas live in `index.html`.
  In **auto** each keeps its own scheme's color (the browser switches with the OS);
  an **explicit** choice overrides both. If the host has none, one is created.
  Owned by **chrome**.

## Usage

Wrap the part of your app that needs theming in `<ThemeProvider>` (typically the
root), then read the theme from any descendant with `useTheme()`:

```tsx
import { ThemeProvider, useTheme } from "@/shared/theme";

// once, at the app root:
<ThemeProvider>
  <App />
</ThemeProvider>

// anywhere below it:
const { theme, onScreenTheme, setTheme, toggleTheme } = useTheme();

<button onClick={toggleTheme}>            // flip light ⇄ dark
<button onClick={() => setTheme("auto")}> // follow the OS
```

`useTheme()` throws if used outside a `<ThemeProvider>`. To style by theme, key
your CSS on `:root[data-theme="dark"]` / `[data-theme="light"]`.

For the mobile pre-paint bar tint to be correct on a cold load, the host's
`index.html` needs the inline boot snippet (see the boot contract below); without
it the theme still works, only the very first paint may flash the default bar
color.

## What it outputs

`useTheme()` returns:

| field | type | meaning |
| --- | --- | --- |
| `theme` | `"light" \| "dark" \| "auto"` | the picked mode |
| `onScreenTheme` | `"light" \| "dark"` | the resolved look |
| `setTheme(mode)` | `(ThemeMode) => void` | set the mode explicitly |
| `toggleTheme()` | `() => void` | flip the on-screen look to the opposite (commits an explicit mode; from `auto` you return via `setTheme("auto")`) |

## The storage key

`THEME_STORAGE_KEY = "theme-mode"` is the `localStorage` key the picked mode is
saved under. It is:

- **written** on every change and **read** on boot;
- **cross-tab**: the provider listens to the `storage` event;
- **validated, not trusted**: anything but `light`/`dark`/`auto` resolves to
  `auto`;
- **safe**: storage access is guarded — absent (SSR) or throwing (privacy mode)
  storage never crashes the provider, it just falls back to `auto` / skips the
  write.

## The pre-paint boot contract (why values are duplicated)

On a cold mobile load the browser commits the bar tint at the **first paint**,
before the JS bundle runs. So `index.html` carries an inline script plus two
media-paired `theme-color` metas that set `data-theme`, the `<html>` background,
and the bar color during head parsing. That script cannot `import`, so it
**duplicates** the colors (`internal/chrome/colors.ts`) and the storage key
(`internal/core/constants.ts`).

`tests/bootSync.test.ts` guards it: it reads `index.html` and fails CI if the
duplicated colors, storage key, or the validation gate drift.

**So: to change a theme color or the storage key, edit the box AND `index.html`
together** — the test enforces it.

## SSR note

`core/` is SSR-safe (guarded `localStorage` / `matchMedia`, isomorphic layout
effect). `chrome/` touches `document` in effects only, so it no-ops during server
render; the mobile bar tint on a hydrated page is seeded by the boot snippet.
