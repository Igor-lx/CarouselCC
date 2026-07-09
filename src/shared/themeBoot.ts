/**
 * Theme boot — the pre-paint browser-chrome initialisation, as a shared,
 * typed, testable module.
 *
 * The logic MUST execute synchronously while the document head is being
 * parsed: mobile browsers commit the bar tint (including the bottom bar) at
 * the first paint of a cold load, so a deferred module import would be too
 * late. It therefore cannot be imported by the page at runtime — instead a
 * build-time step (the `theme-boot-inline` Vite plugin in vite.config.ts)
 * serialises {@link applyThemeBoot} with `Function.prototype.toString()` and
 * inlines the call, plus the media-paired `theme-color` metas, into
 * index.html in place of the `<!-- THEME_BOOT -->` placeholder. One source of
 * truth (this file + the host's color constants), parse-time execution.
 *
 * Because of the serialisation, {@link applyThemeBoot} must stay fully
 * self-contained: no imports, no outer-scope references — only its parameters
 * and browser globals.
 */

export interface ThemeBootColors {
  light: string;
  dark: string;
}

/**
 * Resolve and apply the theme before first paint:
 * - read the stored mode, treating anything but an explicit known value as
 *   "auto" (a stale/corrupted entry must never leak into `data-theme` or
 *   produce an `undefined` chrome color);
 * - stamp `data-theme` on the root element;
 * - pin the root background inline (browser chrome samples the page
 *   background before the stylesheet arrives on a cold load);
 * - for an explicit user choice, override both media-paired `theme-color`
 *   metas so the bar color stops following the OS scheme.
 */
export function applyThemeBoot(colors: ThemeBootColors, storageKey: string): void {
  let mode = "auto";
  try {
    mode = localStorage.getItem(storageKey) || "auto";
  } catch {
    // storage unavailable -> auto
  }
  const isExplicit = mode === "light" || mode === "dark";
  const theme = isExplicit
    ? mode
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  const color = theme === "dark" ? colors.dark : colors.light;

  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.backgroundColor = color;

  if (isExplicit) {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    for (let index = 0; index < metas.length; index += 1) {
      metas[index]!.setAttribute("content", color);
    }
  }
}

/**
 * The parse-time HTML fragment: two media-paired `theme-color` metas (correct
 * the instant the head is parsed; they self-switch with the OS scheme in auto
 * mode) followed by the serialised, self-invoking {@link applyThemeBoot}.
 */
export const themeBootHtml = (
  colors: ThemeBootColors,
  storageKey: string,
): string =>
  [
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${colors.light}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${colors.dark}" />`,
    `<script>(${applyThemeBoot.toString()})(${JSON.stringify(colors)}, ${JSON.stringify(storageKey)});</script>`,
  ].join("\n    ");
