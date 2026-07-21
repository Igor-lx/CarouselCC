import { createElement, type FunctionComponent } from "react";
import { describe, expect, it, vi } from "vitest";

import { resolveSlots } from "./resolveSlots";

/** A slotted component: its `slot` static tags which slot it fills. */
const slotted = (slot: string): FunctionComponent => {
  const C: FunctionComponent = () => null;
  (C as { slot?: string }).slot = slot;
  return C;
};

const Header = slotted("header");
const Footer = slotted("footer");
const Plain: FunctionComponent = () => null; // no slot tag

const SLOTS = ["header", "footer"] as const;

describe("resolveSlots", () => {
  it("assigns each child to its slot and leaves missing slots null", () => {
    const result = resolveSlots(createElement(Header), SLOTS);
    expect(result.header).not.toBeNull();
    expect(result.footer).toBeNull();
  });

  it("last child wins for a repeated slot", () => {
    const first = createElement(Header, { key: "a" });
    const second = createElement(Header, { key: "b" });
    const result = resolveSlots([first, second], SLOTS);
    expect(result.header).toBe(second);
  });

  it("drops a child whose slot is not in the known set", () => {
    const result = resolveSlots(createElement(slotted("sidebar")), SLOTS);
    expect(result.header).toBeNull();
    expect(result.footer).toBeNull();
  });

  it("ignores children without a slot tag and non-element children", () => {
    const result = resolveSlots(
      [createElement(Plain), "text", null, 42, createElement(Footer)],
      SLOTS,
    );
    expect(result.header).toBeNull();
    expect(result.footer).not.toBeNull();
  });

  it("returns every requested slot as a key", () => {
    const result = resolveSlots(null, SLOTS);
    expect(Object.keys(result).sort()).toEqual(["footer", "header"]);
  });

  it("warns (dev) on an unknown slot but does not throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      resolveSlots(createElement(slotted("nope")), SLOTS),
    ).not.toThrow();
    warn.mockRestore();
  });
});
