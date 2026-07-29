// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSlotSizeSource, type SlotSizeSource } from "./useSlotSizeSource";

/**
 * The seam between THE slot measurement and the track binding.
 *
 * It carries a real obligation — "a compositor ride was keyframed in the old
 * pixel scale, tear it down" — and it is invisible: nothing about the deck
 * looks wrong in a unit test if the notification is silently dropped. It was
 * dropped, for a while: the source returned a fresh object each render, the
 * track kept that object in a dependency array and so re-subscribed on every
 * render, and React tears down ALL effects of a commit before running any of
 * them — so a notification emitted from inside a commit arrived after its own
 * listener had gone.
 *
 * These two cases pin both halves: the source stays referentially stable
 * (the cause), and a consumer wired the way the track is wired actually hears
 * a slot change (the consequence).
 */

const VIEWPORT_WIDTH = 400;

let host: HTMLDivElement;
let root: Root;
let observed: SlotSizeSource | null = null;
let subscribeRuns = 0;

/** jsdom reports 0 for every layout box; the measurement needs a real width. */
const withWidth = (node: HTMLDivElement | null): HTMLDivElement | null => {
  if (node) {
    Object.defineProperty(node, "offsetWidth", {
      configurable: true,
      value: VIEWPORT_WIDTH,
    });
  }
  return node;
};

function Probe({
  visibleSlidesCount,
  onSlotMove,
}: {
  visibleSlidesCount: number;
  onSlotMove: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slotSize = useSlotSizeSource({ viewportRef, visibleSlidesCount });
  observed = slotSize;

  // Wired exactly as useTrackBinding wires it: on the stable `subscribe`, not
  // on the source object.
  const subscribe = slotSize.subscribe;
  useLayoutEffect(() => {
    subscribeRuns += 1;
    return subscribe(onSlotMove);
  }, [onSlotMove, subscribe]);

  return (
    <div
      ref={(node) => {
        viewportRef.current = withWidth(node);
      }}
    />
  );
}

const render = (visibleSlidesCount: number, onSlotMove: () => void) =>
  act(() => {
    root.render(
      <Probe visibleSlidesCount={visibleSlidesCount} onSlotMove={onSlotMove} />,
    );
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  observed = null;
  subscribeRuns = 0;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useSlotSizeSource", () => {
  it("publishes the raw slot live and the rounded px as state", () => {
    render(3, () => {});
    expect(observed!.getSlotSize()).toBeCloseTo(VIEWPORT_WIDTH / 3, 10);
    expect(observed!.slotPx).toBe(Math.round(VIEWPORT_WIDTH / 3));
  });

  /** The cause. A fresh object per render is what made every consumer that put
   * the source in a dependency array re-subscribe on every render. */
  it("stays referentially stable across a render that does not move the slot", () => {
    const noop = () => {};
    render(3, noop);
    const first = observed;

    render(3, noop);
    expect(observed).toBe(first);
  });

  /** The consequence, and the thing the track binding actually relies on. */
  it("notifies a subscriber when the slot count moves the slot", () => {
    const onSlotMove = vi.fn();
    render(3, onSlotMove);
    // The mount measurement lands before any consumer can subscribe — the track
    // covers mount through its own layout-origin path, not through this one.
    expect(onSlotMove).not.toHaveBeenCalled();

    render(2, onSlotMove);
    expect(onSlotMove).toHaveBeenCalledTimes(1);
    expect(observed!.getSlotSize()).toBeCloseTo(VIEWPORT_WIDTH / 2, 10);
  });

  it("does not rebuild the subscription on a render that changes nothing", () => {
    const noop = () => {};
    render(3, noop);
    const afterMount = subscribeRuns;

    render(3, noop);
    render(3, noop);
    expect(subscribeRuns).toBe(afterMount);
  });

  it("stays quiet when a re-measure leaves the slot where it was", () => {
    const onSlotMove = vi.fn();
    render(3, onSlotMove);
    onSlotMove.mockClear();

    // Same width, same count: the measurement runs again and finds nothing.
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(onSlotMove).not.toHaveBeenCalled();
  });
});
