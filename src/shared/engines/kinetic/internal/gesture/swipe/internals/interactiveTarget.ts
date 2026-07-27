// Interactive-descendant recognition: a press on a control stays a click unless
// the finger clearly turns it into a horizontal drag. See shared/gesture/README.md § Principle.

/** Opt-out marker: `data-drag-ignore="true"` → never a drag, click preserved. */
export const DRAG_IGNORE_ATTRIBUTE = "data-drag-ignore";

const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "a[href]",
  "summary",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  `[${DRAG_IGNORE_ATTRIBUTE}='true']`,
].join(",");

export const getInteractiveTarget = (
  target: EventTarget | null,
  boundary: HTMLElement,
): Element | null => {
  if (!(target instanceof Element)) return null;
  const interactive = target.closest(INTERACTIVE_TARGET_SELECTOR);
  if (!interactive || !boundary.contains(interactive)) return null;
  return interactive;
};

/** The explicit opt-out alone: `data-drag-ignore="true"` is a deliberate
 * "not the surface" for point exceptions inside it (a like button on a card).
 * For a whole chrome layer use `surfaceRef`. See shared/gesture/README.md § Principle. */
export const getDragIgnoreTarget = (
  target: EventTarget | null,
  boundary: HTMLElement,
): Element | null => {
  if (!(target instanceof Element)) return null;
  const ignored = target.closest(`[${DRAG_IGNORE_ATTRIBUTE}='true']`);
  if (!ignored || !boundary.contains(ignored)) return null;
  return ignored;
};
