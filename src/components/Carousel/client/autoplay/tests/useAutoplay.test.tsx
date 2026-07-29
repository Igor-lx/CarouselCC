// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useAutoplay, type AutoplayApi } from "../useAutoplay";

/**
 * Timers, and nothing but timers. The interval is re-armed from inside its own
 * callback, so a leaked handle is a SECOND autoplay running alongside the
 * first — the deck starts double-stepping and no error is ever thrown.
 *
 * Fake timers throughout: no sleeps, no real clock, no ordering luck.
 */

const INTERVAL = 1000;
const HOVER_DELAY = 150;

interface Options {
  enabled?: boolean;
  isPaused?: boolean;
  isAtEnd?: boolean;
  ignoreHover?: boolean;
  shouldDeferTick?: () => boolean;
}

let host: HTMLDivElement;
let root: Root;
let api: AutoplayApi;
let onStep: Mock<() => void>;
let onGoToStart: Mock<() => void>;

function Probe(options: Options) {
  api = useAutoplay({
    enabled: options.enabled ?? true,
    isPaused: options.isPaused ?? false,
    isAtEnd: options.isAtEnd ?? false,
    intervalMs: INTERVAL,
    hoverPauseDelayMs: HOVER_DELAY,
    ignoreHover: options.ignoreHover ?? false,
    onStep,
    onGoToStart,
    ...(options.shouldDeferTick
      ? { shouldDeferTick: options.shouldDeferTick }
      : {}),
  });
  return null;
}

const render = (options: Options = {}) =>
  act(() => {
    root.render(<Probe {...options} />);
  });

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Timers still armed on the fake clock — the leak detector. */
const pendingTimers = () => vi.getTimerCount();

beforeEach(() => {
  vi.useFakeTimers();
  onStep = vi.fn();
  onGoToStart = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useAutoplay — the tick", () => {
  it("steps once when the interval elapses", () => {
    render();
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("does not fire before the interval is up", () => {
    render();
    advance(INTERVAL - 1);
    expect(onStep).not.toHaveBeenCalled();
  });

  /**
   * Load-bearing, and easy to "fix" into a bug: the tick does NOT repeat by
   * itself. One activation arms one tick. The next one is armed by the pause
   * cycle — the step makes the deck move, `isPaused` goes true and tears the
   * timer down, and the settle brings it back. Turn this into a self-repeating
   * interval and it keeps counting DURING the ride, so the deck double-steps
   * the moment a ride outlasts one interval.
   */
  it("does not re-arm itself — one activation is one tick", () => {
    render();
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);

    advance(INTERVAL * 5);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(pendingTimers()).toBe(0);
  });

  it("the pause cycle is what brings the next tick", () => {
    render();
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);

    // What the deck really does: move, then settle.
    render({ isPaused: true });
    render({ isPaused: false });
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it("loops home instead of stepping when the deck is at its end", () => {
    render({ isAtEnd: true });
    advance(INTERVAL);
    expect(onGoToStart).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("keeps exactly one timer armed while waiting, and none after it fires", () => {
    render();
    expect(pendingTimers()).toBe(1);
    advance(INTERVAL);
    expect(pendingTimers()).toBe(0);
  });

  it("a re-render with unchanged inputs does not add a second timer", () => {
    render();
    render();
    render();
    expect(pendingTimers()).toBe(1);
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoplay — the gates", () => {
  it("disabled arms nothing at all", () => {
    render({ enabled: false });
    expect(pendingTimers()).toBe(0);
    advance(INTERVAL * 3);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("paused arms nothing, and un-pausing starts a fresh full interval", () => {
    render({ isPaused: true });
    advance(INTERVAL * 2);
    expect(onStep).not.toHaveBeenCalled();

    render({ isPaused: false });
    advance(INTERVAL - 1);
    expect(onStep).not.toHaveBeenCalled(); // not a resumed remainder
    advance(1);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("pausing mid-wait cancels the pending tick rather than deferring it", () => {
    render();
    advance(INTERVAL - 100);
    render({ isPaused: true });
    advance(INTERVAL * 3);
    expect(onStep).not.toHaveBeenCalled();
  });
});

describe("useAutoplay — the deferred tick", () => {
  it("re-arms instead of stepping into a busy viewport", () => {
    let busy = true;
    render({ shouldDeferTick: () => busy });

    advance(INTERVAL);
    expect(onStep).not.toHaveBeenCalled();
    expect(pendingTimers()).toBe(1); // it waited, it did not give up

    busy = false;
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("a viewport that never settles never steps and never leaks", () => {
    render({ shouldDeferTick: () => true });
    for (let i = 0; i < 10; i += 1) advance(INTERVAL);
    expect(onStep).not.toHaveBeenCalled();
    expect(pendingTimers()).toBe(1);
  });
});

describe("useAutoplay — hover", () => {
  it("pauses once the hover has been held for the delay", () => {
    render();
    act(() => api.handleHoverChange(true));

    // Advanced in two steps on purpose: React has to process the pause between
    // the hover timer and the interval, which a single advance would not allow.
    advance(HOVER_DELAY);
    advance(INTERVAL);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("a hover shorter than the delay never pauses at all", () => {
    render();
    act(() => api.handleHoverChange(true));
    advance(HOVER_DELAY - 50);
    act(() => api.handleHoverChange(false));

    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("leaving resumes the tick", () => {
    render();
    act(() => api.handleHoverChange(true));
    advance(HOVER_DELAY);
    advance(INTERVAL * 2);
    expect(onStep).not.toHaveBeenCalled();

    act(() => api.handleHoverChange(false));
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("ignoreHover makes the pointer irrelevant — a touch deck never pauses", () => {
    render({ ignoreHover: true });
    act(() => api.handleHoverChange(true));
    advance(HOVER_DELAY);
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("turning autoplay off releases a hover pause instead of latching it", () => {
    render();
    act(() => api.handleHoverChange(true));
    advance(HOVER_DELAY);

    render({ enabled: false });
    render({ enabled: true });
    advance(INTERVAL);
    expect(onStep).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoplay — teardown", () => {
  it("leaves no timer behind on unmount", () => {
    render();
    act(() => api.handleHoverChange(true)); // a hover timer too
    expect(pendingTimers()).toBeGreaterThan(0);

    act(() => root.unmount());
    expect(pendingTimers()).toBe(0);

    root = createRoot(host); // afterEach unmounts again; keep it valid
  });

  it("does not step after unmount", () => {
    render();
    act(() => root.unmount());
    root = createRoot(host);

    advance(INTERVAL * 3);
    expect(onStep).not.toHaveBeenCalled();
  });
});
