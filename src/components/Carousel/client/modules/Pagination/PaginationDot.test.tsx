// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PaginationDot } from "./PaginationDot";

/**
 * The dot's interactivity contract (see the component note): the TAG follows
 * `isInteractiveOn` alone. That it does NOT follow `isActive` is the subtle
 * half — a tag swap remounts the element, which would tear the cross-fade's
 * ref binding out from under a running WAAPI animation on every page change.
 */

const classNames = {
  dot: "dot",
  dotActive: "dotActive",
  dotInteractive: "dotInteractive",
};

let host: HTMLDivElement;
let root: Root;

const render = (props: { isInteractiveOn: boolean; isActive: boolean }) =>
  act(() => {
    root.render(
      <PaginationDot
        pageIndex={0}
        isActive={props.isActive}
        isInteractiveOn={props.isInteractiveOn}
        classNames={classNames}
        onPageSelect={() => {}}
      />,
    );
  });

const dot = () => host.firstElementChild as HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PaginationDot", () => {
  it("renders a <button> when interactive, an inert <div> when not", () => {
    render({ isInteractiveOn: true, isActive: false });
    expect(dot().tagName).toBe("BUTTON");
    expect(dot().className).toContain("dotInteractive");

    render({ isInteractiveOn: false, isActive: false });
    expect(dot().tagName).toBe("DIV");
    // The pointer affordance travels with the class, not with `.dot`.
    expect(dot().className).not.toContain("dotInteractive");
    expect(dot().className).toContain("dot");
  });

  it("keeps the tag stable across active flips (the cross-fade ref must survive)", () => {
    render({ isInteractiveOn: true, isActive: false });
    const before = dot();
    render({ isInteractiveOn: true, isActive: true });
    expect(dot().tagName).toBe("BUTTON");
    // Same DOM node — no remount, so a running animation keeps its element.
    expect(dot()).toBe(before);

    render({ isInteractiveOn: false, isActive: false });
    const inertBefore = dot();
    render({ isInteractiveOn: false, isActive: true });
    expect(dot().tagName).toBe("DIV");
    expect(dot()).toBe(inertBefore);
  });

  it("marks the active dot disabled only in the interactive form", () => {
    render({ isInteractiveOn: true, isActive: true });
    expect((dot() as HTMLButtonElement).disabled).toBe(true);
    expect(dot().className).toContain("dotActive");

    render({ isInteractiveOn: true, isActive: false });
    expect((dot() as HTMLButtonElement).disabled).toBe(false);
  });

  it("fires page selection only when interactive", () => {
    const onPageSelect = vi.fn();
    act(() => {
      root.render(
        <PaginationDot
          pageIndex={3}
          isActive={false}
          isInteractiveOn={false}
          classNames={classNames}
          onPageSelect={onPageSelect}
        />,
      );
    });
    act(() => {
      dot().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPageSelect).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <PaginationDot
          pageIndex={3}
          isActive={false}
          isInteractiveOn={true}
          classNames={classNames}
          onPageSelect={onPageSelect}
        />,
      );
    });
    act(() => {
      dot().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPageSelect).toHaveBeenCalledWith(3);
  });
});
