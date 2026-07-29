// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useFocusRecovery } from "../useFocusRecovery";

/**
 * WHEN the keyboard rescue runs. `manageFocusShift` decides where focus goes;
 * this hook decides when to ask, and both halves of that are load-bearing:
 *
 *  - ask too rarely and focus stays on a slide the browser has just made
 *    inert, so tab order restarts from the top of the page;
 *  - ask on every frame and the rescue fights the user, stealing focus back
 *    mid-ride each time the band flickers.
 *
 * The band is asserted through the real DOM: a focused button inside a slide
 * that leaves the active zone must end up on the slide that entered it.
 */

let host: HTMLDivElement;
let root: Root;
let container: HTMLElement;

interface Props {
  isIdle: boolean;
  targetPageIndex: number;
  /** Which slide is the active band this render. */
  activeIndex: number;
}

function Probe({ isIdle, targetPageIndex, activeIndex }: Props) {
  const containerRef = useRef<HTMLElement | null>(null);
  useFocusRecovery({ containerRef, isIdle, targetPageIndex });
  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        if (node) container = node;
      }}
      tabIndex={-1}
    >
      {[0, 1].map((index) => (
        <div
          key={index}
          data-active-zone={String(index === activeIndex)}
          data-index={index}
          inert={index === activeIndex ? undefined : true}
        >
          <button data-button={index}>slide {index}</button>
        </div>
      ))}
    </div>
  );
}

const render = (props: Props) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const button = (index: number) =>
  host.querySelector<HTMLElement>(`[data-button="${index}"]`)!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useFocusRecovery — when it rescues", () => {
  it("rescues focus when the deck settles on a new page", () => {
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    button(0).focus();

    // A ride runs and settles on page 1: slide 0 has left the band.
    render({ isIdle: false, targetPageIndex: 1, activeIndex: 0 });
    render({ isIdle: true, targetPageIndex: 1, activeIndex: 1 });

    expect(document.activeElement).toBe(button(1));
  });

  it("stays out of the way while the deck is still moving", () => {
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    button(0).focus();

    // Mid-ride the band flickers; stealing focus here would fight the user.
    render({ isIdle: false, targetPageIndex: 1, activeIndex: 1 });
    expect(document.activeElement).toBe(button(0));
  });

  it("does not fire again while idle on the same page", () => {
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    // Focus something the rescue WOULD move if it ran again.
    button(1).focus();

    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    expect(document.activeElement).toBe(button(1));
  });

  // NOT tested, deliberately: the `previous.isIdle && same page` guard inside
  // the hook. It can only be reached on a StrictMode double mount, and a
  // second rescue there is idempotent anyway — `manageFocusShift` returns early
  // once focus is already in the active band. Any test for it would pass with
  // the guard removed, which makes it a test that cannot fail.

  it("fires on a page change that never left idle — a reduced-motion step", () => {
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    button(0).focus();

    // An instant step: the page moves with no ride in between.
    render({ isIdle: true, targetPageIndex: 1, activeIndex: 1 });
    expect(document.activeElement).toBe(button(1));
  });

  it("leaves focus alone when it is outside the carousel", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    outside.focus();

    render({ isIdle: false, targetPageIndex: 1, activeIndex: 0 });
    render({ isIdle: true, targetPageIndex: 1, activeIndex: 1 });

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("survives an unmounted container without throwing", () => {
    render({ isIdle: true, targetPageIndex: 0, activeIndex: 0 });
    expect(container).toBeDefined();
    expect(() =>
      render({ isIdle: true, targetPageIndex: 5, activeIndex: 1 }),
    ).not.toThrow();
  });
});

