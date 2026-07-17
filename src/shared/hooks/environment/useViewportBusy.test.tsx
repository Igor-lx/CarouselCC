// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useViewportBusy } from "./useViewportBusy";

/**
 * Contract of the "viewport is unsettled" signal (see the hook's WHY): busy
 * rises synchronously on the first touch, survives the whole activity tail
 * (fling scroll frames, browser-chrome resizes — the window SELF-EXTENDS on
 * every signal, so it is not tuned to any fling/settle duration), and decays
 * quietDelayMs after the LAST signal with no finger down.
 */

let root: Root;
let host: HTMLDivElement;
let latest: boolean;

const Probe = ({ enabled }: { enabled: boolean }) => {
  latest = useViewportBusy({ enabled, quietDelayMs: 600 });
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
  vi.useFakeTimers();
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
  it("rises on touch, stays through the hold, decays quietDelayMs after the lift", () => {
    mount(true);
    expect(latest).toBe(false);

    fire("touchstart", 1);
    expect(latest).toBe(true);

    advance(5000); // a long hold never expires while the finger is down
    expect(latest).toBe(true);

    fire("touchend", 0);
    expect(latest).toBe(true); // the settle window is still open
    advance(599);
    expect(latest).toBe(true);
    advance(2);
    expect(latest).toBe(false);
  });

  it("the window self-extends on fling scrolls and chrome resizes after the lift", () => {
    mount(true);
    fire("touchstart", 1);
    fire("touchend", 0);

    // A fling: scroll frames keep arriving long after the lift — each one
    // re-arms the window, regardless of how long the fling runs.
    for (let i = 0; i < 5; i += 1) {
      advance(400);
      fireWindow("scroll");
    }
    expect(latest).toBe(true);

    // The browser-chrome settle after the fling re-arms it too.
    advance(400);
    fireWindow("resize");
    expect(latest).toBe(true);

    advance(601); // finally quiet
    expect(latest).toBe(false);
  });

  it("a second finger keeps it busy until the LAST finger lifts", () => {
    mount(true);
    fire("touchstart", 1);
    fire("touchstart", 2);
    fire("touchend", 1); // one finger remains
    advance(5000);
    expect(latest).toBe(true);

    fire("touchend", 0);
    advance(601);
    expect(latest).toBe(false);
  });

  it("disabled: no listeners, constant false", () => {
    mount(false);
    fire("touchstart", 1);
    expect(latest).toBe(false);
  });
});
