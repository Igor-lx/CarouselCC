// @vitest-environment jsdom
/**
 * FORK of `shared/engines/gesture/tests/interactiveTarget.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { describe, expect, it } from "vitest";

import {
  DRAG_IGNORE_ATTRIBUTE,
  getInteractiveTarget,
  getDragIgnoreTarget,
} from "../swipe/internals/interactiveTarget";

/**
 * What counts as "a control under the finger" — the list itself is the
 * contract, and it had no test of its own: the engine's other suites press on
 * a button and a plain div, so fourteen of the fifteen selectors were never
 * asked anything.
 *
 * The cost of a wrong answer runs both ways. Miss a control and a press on it
 * becomes a drag: the button never fires, and the deck slides under a finger
 * that meant to tap. Claim one too eagerly and the deck stops being draggable
 * over that element for no reason the user can see.
 */

const host = () => {
  const boundary = document.createElement("div");
  document.body.appendChild(boundary);
  return boundary;
};

/** Put `html` inside a boundary and hand back the deepest element in it. */
const plant = (html: string) => {
  const boundary = host();
  boundary.innerHTML = html;
  const target =
    boundary.querySelector("[data-press]") ?? boundary.firstElementChild!;
  return { boundary, target };
};

describe("getInteractiveTarget — the list of controls", () => {
  const cases: Array<[string, string]> = [
    ["button", "<button>press</button>"],
    ["input", "<input />"],
    ["select", "<select></select>"],
    ["textarea", "<textarea></textarea>"],
    ["label", "<label>name</label>"],
    ["a[href]", '<a href="/somewhere">link</a>'],
    ["summary", "<details><summary data-press>more</summary></details>"],
    ["contenteditable", '<div contenteditable="true">text</div>'],
    ["role=button", '<div role="button">press</div>'],
    ["role=link", '<div role="link">go</div>'],
    ["role=checkbox", '<div role="checkbox">on</div>'],
    ["role=radio", '<div role="radio">one</div>'],
    ["role=switch", '<div role="switch">off</div>'],
    ["role=tab", '<div role="tab">first</div>'],
    ["drag-ignore", `<div ${DRAG_IGNORE_ATTRIBUTE}="true">card</div>`],
  ];

  it.each(cases)("recognises %s", (_name, html) => {
    const { boundary, target } = plant(html);
    expect(getInteractiveTarget(target, boundary)).toBe(target);
  });

  it("leaves a plain element alone", () => {
    // The other half of the contract: everything not on the list is deck.
    const { boundary, target } = plant("<div>just content</div>");
    expect(getInteractiveTarget(target, boundary)).toBeNull();
  });

  it("does not take an anchor without an href", () => {
    // `a[href]`, not `a`: a bare anchor is a styling hook, not a control.
    const { boundary, target } = plant("<a>not a link</a>");
    expect(getInteractiveTarget(target, boundary)).toBeNull();
  });

  it("does not take contenteditable that is switched off", () => {
    const { boundary, target } = plant(
      '<div contenteditable="false">text</div>',
    );
    expect(getInteractiveTarget(target, boundary)).toBeNull();
  });

  it("climbs to the control the press landed inside", () => {
    // Fingers land on the label inside a button, not on the button itself.
    const { boundary } = plant(
      "<button><span data-press>press</span></button>",
    );
    const span = boundary.querySelector("span")!;
    expect(getInteractiveTarget(span, boundary)).toBe(
      boundary.querySelector("button"),
    );
  });

  it("ignores a control that is not inside the boundary", () => {
    // `closest` climbs out of the host; the boundary check is what stops it.
    // Without it a press inside the deck could report a control from an
    // ancestor toolbar and the deck would stop dragging there.
    const outer = document.createElement("button");
    document.body.appendChild(outer);
    const inner = document.createElement("div");
    outer.appendChild(inner);
    const boundary = host();

    expect(getInteractiveTarget(inner, boundary)).toBeNull();
  });

  it("answers null for a target that is not an element at all", () => {
    // Pointer events can carry a document or a text node as the target.
    const boundary = host();
    expect(getInteractiveTarget(document, boundary)).toBeNull();
    expect(getInteractiveTarget(null, boundary)).toBeNull();
  });
});

describe("getDragIgnoreTarget — the explicit opt-out only", () => {
  it("takes the marked element", () => {
    const { boundary, target } = plant(
      `<div ${DRAG_IGNORE_ATTRIBUTE}="true">card</div>`,
    );
    expect(getDragIgnoreTarget(target, boundary)).toBe(target);
  });

  it("climbs to a marked ancestor", () => {
    const { boundary } = plant(
      `<div ${DRAG_IGNORE_ATTRIBUTE}="true"><span data-press>x</span></div>`,
    );
    const span = boundary.querySelector("span")!;
    expect(getDragIgnoreTarget(span, boundary)).toBe(
      boundary.querySelector(`[${DRAG_IGNORE_ATTRIBUTE}]`),
    );
  });

  it("does NOT take an ordinary control", () => {
    // The difference between the two functions is the whole point: a button is
    // interactive, but it stays part of the surface — a drag started on it
    // still drags. Only the explicit marker opts out.
    const { boundary, target } = plant("<button>press</button>");
    expect(getInteractiveTarget(target, boundary)).toBe(target);
    expect(getDragIgnoreTarget(target, boundary)).toBeNull();
  });

  it("requires the marker to say exactly true", () => {
    const { boundary, target } = plant(
      `<div ${DRAG_IGNORE_ATTRIBUTE}="false">card</div>`,
    );
    expect(getDragIgnoreTarget(target, boundary)).toBeNull();
  });

  it("ignores a marked element outside the boundary", () => {
    const outer = document.createElement("div");
    outer.setAttribute(DRAG_IGNORE_ATTRIBUTE, "true");
    document.body.appendChild(outer);
    const inner = document.createElement("span");
    outer.appendChild(inner);
    const boundary = host();

    expect(getDragIgnoreTarget(inner, boundary)).toBeNull();
  });

  it("answers null for a target that is not an element", () => {
    const boundary = host();
    expect(getDragIgnoreTarget(document, boundary)).toBeNull();
  });
});
