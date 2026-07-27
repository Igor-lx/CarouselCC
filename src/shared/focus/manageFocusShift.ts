const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// See ./README.md
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
