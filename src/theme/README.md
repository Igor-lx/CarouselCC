# Theme

A small light / dark / **auto** theme system for the app shell. It persists the
user's choice, drives `data-theme` on `<html>`, and keeps the mobile
browser-chrome tint (the address/status bar) in sync — including the tricky
pre-paint window on a cold mobile load.

## Two concepts

- **`theme`** — the MODE the user picked: `"light"`, `"dark"`, or `"auto"`.
  `auto` follows the OS `prefers-color-scheme` live.
- **`onScreenTheme`** — the RESOLVED look currently showing: `"light"` or
  `"dark"` (never `auto`). In `auto` mode it tracks the OS; otherwise it equals
  the chosen mode.

## What it drives

On every change the provider updates three surfaces:

- `document.documentElement` gets `data-theme="light|dark"` — the stylesheet keys
  off it (`:root[data-theme="dark"]` … in `globals.scss`).
- the inline `<html>` background-color (mobile chrome samples it — see the boot
  contract below).
- the `theme-color` meta tags (the browser bar tint).

## Usage

The app is already wrapped in `<ThemeProvider>`. In any component:

```tsx
import { useTheme } from "@/theme/useTheme";

const { theme, onScreenTheme, setTheme, toggleTheme } = useTheme();

<button onClick={toggleTheme}>            // flip light ⇄ dark
<button onClick={() => setTheme("auto")}> // follow the OS
```

`useTheme()` throws if used outside `<ThemeProvider>`. To style by theme, key
your CSS on `:root[data-theme="dark"]` / `[data-theme="light"]`.

## What it outputs

`useTheme()` returns the context value:

| field | type | meaning |
| --- | --- | --- |
| `theme` | `"light" \| "dark" \| "auto"` | the picked mode |
| `onScreenTheme` | `"light" \| "dark"` | the resolved look |
| `setTheme(mode)` | `(ThemeMode) => void` | set the mode explicitly |
| `toggleTheme()` | `() => void` | flip the on-screen look to the opposite |

## The storage key

`THEME_STORAGE_KEY = "theme-mode"` is the `localStorage` key the picked mode is
saved under, so the choice survives reloads. It is:

- **written** on every change and **read** on boot;
- **cross-tab**: the provider listens to the `storage` event, so changing the
  theme in one tab updates the others;
- **validated, not trusted**: any value that is not exactly `light`/`dark`/`auto`
  resolves to `auto` (a stale or corrupted entry once leaked into `data-theme`
  and produced `content="undefined"` bar colors until the cache was cleared);
- **react-free** (defined in `types.ts`) so the non-React pre-paint boot script
  can use the same key.

## The pre-paint boot contract (why values are duplicated)

On a cold mobile load the browser commits the bar tint at the **first paint**,
before the JS bundle runs. So `index.html` carries an inline script plus two
media-paired `theme-color` metas that set `data-theme`, the `<html>` background,
and the bar color synchronously during head parsing. That script cannot
`import`, so it **duplicates** the colors and the storage key from `types.ts`.

`themeBootSync.test.ts` is the guard: it reads `index.html` and fails CI if the
duplicated colors, storage key, or the validation gate drift from `types.ts`.

**So: to change a theme color or the storage key, edit `types.ts` AND
`index.html` together** — the test enforces it.

## Files

- `types.ts` — SSOT: mode/color constants, the storage key, and the types.
- `ThemeContext.ts` — the React context object.
- `ThemeProvider.tsx` — the effects (resolve mode → apply `data-theme`, bg, metas;
  persist; cross-tab sync).
- `useTheme.ts` — the consumer hook.
- `themeBootSync.test.ts` — the CI guard for the `index.html` duplication.
