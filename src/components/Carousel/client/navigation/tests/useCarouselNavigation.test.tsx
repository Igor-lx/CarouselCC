// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { CarouselCommand } from "../../state";
import type { Slide } from "../../public-api/types";
import {
  useCarouselNavigation,
  type CarouselNavigation,
} from "../useCarouselNavigation";

/**
 * Every deliberate command the user gives the deck goes through here: the
 * arrows, the dots, and a click on a slide. The hook had no test at all.
 *
 * Two things it does are easy to lose and impossible to see: it reads the
 * deck's position AT THE MOMENT of the command rather than at the render that
 * built the handler — a stale origin makes the ride start from where the deck
 * was a second ago — and it refuses everything while navigation is off, which
 * is the only thing standing between a disabled carousel and a working one.
 */

let host: HTMLDivElement;
let root: Root;
let commands: CarouselCommand[];
let clicked: Slide[];
let position: number;
let api: CarouselNavigation;

interface ProbeProps {
  enabled?: boolean;
  withSlideClick?: boolean;
}

// Stable across renders, the way the carousel passes them: `dispatch` comes
// from `useReducer` and the position reader from a ref. Rebuilding them here
// would make the hook's memo look broken when it is the probe that moved.
const dispatch = (command: CarouselCommand) => {
  commands.push(command);
};
const onSlideClick = (slide: Slide) => {
  clicked.push(slide);
};
const readCurrentPosition = () => position;

function Probe({ enabled = true, withSlideClick = true }: ProbeProps) {
  api = useCarouselNavigation({
    enabled,
    dispatch,
    readCurrentPosition,
    ...(withSlideClick ? { onSlideClick } : {}),
  });
  return null;
}

const render = (props: ProbeProps = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const last = () => commands[commands.length - 1];

beforeEach(() => {
  commands = [];
  clicked = [];
  position = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useCarouselNavigation — the commands it sends", () => {
  it("steps by the amount it was given, with the caller's reason", () => {
    render();

    act(() => api.move(2, "gesture"));

    expect(last()).toMatchObject({
      type: "MOVE",
      step: 2,
      moveReason: "gesture",
    });
  });

  it("goes to a page by index, with the caller's reason", () => {
    render();

    act(() => api.goTo(4, "autoplay"));

    expect(last()).toMatchObject({
      type: "GO_TO",
      targetPageIndex: 4,
      moveReason: "autoplay",
    });
  });

  it("reads the deck's position when the command is given, not when it was built", () => {
    // The handlers are memoised and outlive many frames of movement. Capturing
    // the position at build time makes every ride start from wherever the deck
    // happened to be when the component last rendered.
    render();
    position = 7.25;

    act(() => api.move(1, "click"));

    expect(last()).toMatchObject({ fromVirtualIndex: 7.25 });
  });

  it("sends the arrows one page each way, as a click", () => {
    render();

    act(() => api.handlePrev());
    expect(last()).toMatchObject({
      type: "MOVE",
      step: -1,
      moveReason: "click",
    });

    act(() => api.handleNext());
    expect(last()).toMatchObject({
      type: "MOVE",
      step: 1,
      moveReason: "click",
    });
  });

  it("sends a dot as a jump to that page, as a click", () => {
    render();

    act(() => api.handlePageSelect(3));

    expect(last()).toMatchObject({
      type: "GO_TO",
      targetPageIndex: 3,
      moveReason: "click",
    });
  });
});

describe("useCarouselNavigation — while navigation is off", () => {
  it("sends nothing at all", () => {
    // Not "sends and the reducer ignores it": the command never leaves. A
    // disabled deck that still dispatches would move on every arrow press.
    render({ enabled: false });

    act(() => {
      api.move(1, "click");
      api.goTo(2, "click");
      api.handlePrev();
      api.handleNext();
      api.handlePageSelect(1);
    });

    expect(commands).toEqual([]);
  });

  it("still passes a slide click through to the host", () => {
    // The gate is about MOVING the deck. Whether a click on a slide means
    // anything is the host's business, and it keeps meaning it either way.
    render({ enabled: false });
    const slide: Slide = { id: "s1", content: "one" };

    act(() => api.handleSlideClick(slide));

    expect(clicked).toEqual([slide]);
  });
});

describe("useCarouselNavigation — the slide click", () => {
  it("hands the slide to the host", () => {
    render();
    const slide: Slide = { id: "s2", content: "two" };

    act(() => api.handleSlideClick(slide));

    expect(clicked).toEqual([slide]);
  });

  it("does nothing, rather than throwing, when the host wants no clicks", () => {
    // `onSlideClick` is optional and SlideItem calls the handler regardless:
    // the absence has to be handled here, once, not at every call site.
    render({ withSlideClick: false });

    expect(() => {
      act(() => api.handleSlideClick({ id: "s3", content: "three" }));
    }).not.toThrow();
    expect(commands).toEqual([]);
  });
});

describe("useCarouselNavigation — the object it hands out", () => {
  it("stays identical across a render that changes nothing", () => {
    // It goes into the stable half of the carousel's context, which every
    // module subscribes to: a fresh object per render re-renders all of them.
    render();
    const first = api;

    render();

    expect(api).toBe(first);
  });

  it("is rebuilt when the gate itself moves", () => {
    render();
    const enabledApi = api;

    render({ enabled: false });

    expect(api).not.toBe(enabledApi);
  });
});
