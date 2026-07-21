/**
 * Recognition of interactive descendants: a press that starts on a button,
 * link, form control (or anything opted out via the drag-ignore attribute)
 * must stay a click unless the finger clearly turns it into a horizontal
 * drag.
 */

/**
 * Opt-out escape hatch: any element carrying `data-drag-ignore="true"` (or a
 * descendant of one) is treated as interactive — the engine never starts a
 * drag from it and never suppresses its clicks after a swipe.
 */
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

/**
 * The explicit opt-out, on its own: an element (or ancestor) marked
 * `data-drag-ignore="true"` is NOT part of the draggable surface. Unlike
 * plain interactivity — a `<button>` may well BE the surface, e.g. an
 * interactive slide — this marker is a deliberate statement by the host, so
 * the engine takes no ownership and starts no drag from it.
 *
 * Use it for point exceptions INSIDE the surface (a like button on a card).
 * For a whole chrome layer, declare the surface positively instead
 * (`surfaceRef`) — that cannot be forgotten on the next element added.
 */
export const getDragIgnoreTarget = (
  target: EventTarget | null,
  boundary: HTMLElement,
): Element | null => {
  if (!(target instanceof Element)) return null;
  const ignored = target.closest(`[${DRAG_IGNORE_ATTRIBUTE}='true']`);
  if (!ignored || !boundary.contains(ignored)) return null;
  return ignored;
};
