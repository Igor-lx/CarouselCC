// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useViewportBusy } from "./useViewportBusy";

/**
 * Contract of the "viewport is unsettled" signal (see the hook's WHY): busy
 * rises with the first touch, survives the whole activity tail (fling scroll
 * frames, chrome resizes — the window SELF-EXTENDS on every signal), and
 * decays quietDelayMs after the LAST signal with no finger down.
 *
 * And the headline regression contract: the hook is a GETTER, and NOTHING
 * about a touch may re-render the consumer — the reactive first version
 * re-rendered the deck at the exact moment a finger landed and visibly
 * hitched an in-flight autoplay ride on a weak device.
 */

let root: Root;
let host: HTMLDivElement;
let getBusy: () => boolean;
let renders = 0;

const Probe = ({ enabled }: { enabled: boolean }) => {
  renders += 1;
  getBusy = useViewportBusy({ enabled, quietDelayMs: 600 });
  return null;
};

const mount = (enabled: boolean) =>
  act(() => {
    root.render(<Probe enabled={enabled} />);
  });

const fire = (type: string, touches: number) =>
  act(() => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "touches", { value: new Array(touches) });
    document.dispatchEvent(event);
  });

const fireWindow = (type: string) =>
  act(() => {
    window.dispatchEvent(new Event(type));
  });

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
  });
  renders = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useViewportBusy", () => {
  it("NEVER re-renders the consumer — touches, scrolls, resizes are ref-only", () => {
    mount(true);
    const after = renders;

    fire("touchstart", 1);
    fireWindow("scroll");
    fireWindow("resize");
    fire("touchend", 0);
    advance(1000);

    expect(renders).toBe(after);
  });

  it("rises on touch, stays through the hold, decays quietDelayMs after the lift", () => {
    mount(true);
    expect(getBusy()).toBe(false);

    fire("touchstart", 1);
    expect(getBusy()).toBe(true);

    advance(5000); // a long hold never expires while the finger is down
    expect(getBusy()).toBe(true);

    fire("touchend", 0);
    expect(getBusy()).toBe(true); // the settle window is still open
    advance(599);
    expect(getBusy()).toBe(true);
    advance(2);
    expect(getBusy()).toBe(false);
  });

  it("the window self-extends on fling scrolls and chrome resizes after the lift", () => {
    mount(true);
    fire("touchstart", 1);
    fire("touchend", 0);

    // A fling: scroll frames keep arriving long after the lift — each one
    // refreshes the window, regardless of how long the fling runs.
    for (let i = 0; i < 5; i += 1) {
      advance(400);
      fireWindow("scroll");
    }
    expect(getBusy()).toBe(true);

    // The browser-chrome settle after the fling refreshes it too.
    advance(400);
    fireWindow("resize");
    expect(getBusy()).toBe(true);

    advance(601); // finally quiet
    expect(getBusy()).toBe(false);
  });

  it("a second finger keeps it busy until the LAST finger lifts", () => {
    mount(true);
    fire("touchstart", 1);
    fire("touchstart", 2);
    fire("touchend", 1); // one finger remains
    advance(5000);
    expect(getBusy()).toBe(true);

    fire("touchend", 0);
    advance(601);
    expect(getBusy()).toBe(false);
  });

  it("disabled: no listeners, constant false", () => {
    mount(false);
    fire("touchstart", 1);
    expect(getBusy()).toBe(false);
  });
});
