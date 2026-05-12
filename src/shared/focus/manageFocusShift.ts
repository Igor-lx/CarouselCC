const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Move focus into the active band when the current focus has been hidden
 * inside an `inert` subtree. Used after a carousel settle. The function is
 * intentionally generic: it expects a container scope and a `data-active-zone`
 * marker on the in-band element.
 */
export const manageFocusShift = (container: HTMLElement | null): void => {
  if (!container) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) return;

  const slide = active.closest<HTMLElement>("[data-active-zone]");
  if (!slide) return;

  if (slide.dataset.activeZone === "true" && !active.closest("[inert]")) return;

  const target = container.querySelector<HTMLElement>(
    '[data-active-zone="true"]:not([inert])',
  );

  if (!target) {
    container.focus({ preventScroll: true });
    return;
  }

  const focusable = target.matches(FOCUSABLE_SELECTOR)
    ? target
    : target.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

  (focusable ?? container).focus({ preventScroll: true });
};
