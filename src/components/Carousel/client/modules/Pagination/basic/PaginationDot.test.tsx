// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PaginationDot } from "./PaginationDot";

/** The dot's interactivity contract: the flag alone decides whether a dot is a
 * clickable `<button>` or an inert `<div>`. */

const classNames = {
  dot: "dot",
  dotActive: "dotActive",
  dotInteractive: "dotInteractive",
};

let host: HTMLDivElement;
let root: Root;

const render = (props: {
  isInteractiveOn: boolean;
  isActive?: boolean;
  onPageSelect?: (pageIndex: number) => void;
}) =>
  act(() => {
    root.render(
      <PaginationDot
        pageIndex={3}
        isActive={props.isActive ?? false}
        isInteractiveOn={props.isInteractiveOn}
        classNames={classNames}
        onPageSelect={props.onPageSelect ?? (() => {})}
      />,
    );
  });

const dot = () => host.firstElementChild as HTMLElement;
const click = () =>
  act(() => {
    dot().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

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
    render({ isInteractiveOn: true });
    expect(dot().tagName).toBe("BUTTON");
    expect(dot().className).toContain("dotInteractive");

    render({ isInteractiveOn: false });
    expect(dot().tagName).toBe("DIV");
    // The pointer affordance travels with the class, not with `.dot`.
    expect(dot().className).toContain("dot");
    expect(dot().className).not.toContain("dotInteractive");
  });

  it("selects a page only when interactive", () => {
    const onPageSelect = vi.fn();

    render({ isInteractiveOn: false, onPageSelect });
    click();
    expect(onPageSelect).not.toHaveBeenCalled();

    render({ isInteractiveOn: true, onPageSelect });
    click();
    expect(onPageSelect).toHaveBeenCalledWith(3);
  });
});
