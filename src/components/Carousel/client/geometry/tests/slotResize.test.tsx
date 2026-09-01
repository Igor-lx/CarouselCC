// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSlotSizeSource, type SlotSizeSource } from "../useSlotSizeSource";

/**
 * How the one measurement learns that it is stale.
 *
 * jsdom has no `ResizeObserver`, so the whole observer branch — the widest
 * single block in this file — was never executed by anything: 28 of its
 * mutants had no coverage at all. It is not decoration. The observer is what
 * re-measures the deck when the container resizes without the window doing so
 * (a sidebar opening, a font loading, a flex parent settling), and it reads
 * `contentRect` precisely so the callback costs no layout read.
 *
 * Two epsilons live here and they do different jobs, which is the part worth
 * pinning: the VIEWPORT epsilon (0.5px) throws away resize noise before any
 * measurement happens, while the SLOT epsilon (1px) keeps the PUBLISHED value
 * still through sub-pixel drift — the live raw value is never rounded, because
 * the track paints from it every frame.
 */

const VIEWPORT_EPSILON_PX = 0.5;

let host: HTMLDivElement;
let root: Root;
let source: SlotSizeSource | null = null;
let moves: number;
let layoutWidth: number;

/** The fake observer the component gets instead of the missing global. */
interface FakeObserver {
  target: Element | null;
  disconnected: boolean;
  emit: (width: unknown) => void;
  emitEmpty: () => void;
}
let observers: FakeObserver[];

const installResizeObserver = () => {
  observers = [];
  class FakeResizeObserver {
    private readonly callback: ResizeObserverCallback;
    private readonly self: FakeObserver;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      this.self = {
        target: null,
        disconnected: false,
        emit: (width: unknown) => {
          this.callback(
            [{ contentRect: { width } } as unknown as ResizeObserverEntry],
            this,
          );
        },
        emitEmpty: () => {
          this.callback([], this);
        },
      };
      observers.push(this.self);
    }

    observe(target: Element) {
      this.self.target = target;
    }

    unobserve() {}

    disconnect() {
      this.self.disconnected = true;
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
};

const latest = () => observers[observers.length - 1]!;

function Probe({
  visibleSlidesCount,
  hasViewport = true,
}: {
  visibleSlidesCount: number;
  hasViewport?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slotSize = useSlotSizeSource({ viewportRef, visibleSlidesCount });
  source = slotSize;

  // Subscribed once, the way the track binding does it — on the stable
  // callback rather than on the source object.
  const subscribe = slotSize.subscribe;
  useEffect(
    () =>
      subscribe(() => {
        moves += 1;
      }),
    [subscribe],
  );

  // `hasViewport` is deliberately not an effect dependency: dropping the node
  // empties the ref without re-running the observer effect, which is what a
  // collapsed deck looks like from inside this hook.
  return hasViewport ? (
    <div
      ref={(node) => {
        if (node) {
          Object.defineProperty(node, "offsetWidth", {
            configurable: true,
            get: () => layoutWidth,
          });
        }
        viewportRef.current = node;
      }}
    />
  ) : null;
}

const render = (visibleSlidesCount: number, hasViewport = true) =>
  act(() => {
    root.render(
      <Probe
        visibleSlidesCount={visibleSlidesCount}
        hasViewport={hasViewport}
      />,
    );
  });

beforeEach(() => {
  installResizeObserver();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  source = null;
  moves = 0;
  layoutWidth = 400;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the observer that notices a container resize", () => {
  it("watches the viewport, and lets go of it on unmount", () => {
    render(2);
    const viewport = host.querySelector("div") as Element;

    expect(latest().target).toBe(viewport);
    expect(latest().disconnected).toBe(false);

    const observer = latest();
    act(() => root.unmount());
    root = createRoot(host);

    expect(observer.disconnected).toBe(true);
  });

  it("measures from the width the observer reports, not from the layout box", () => {
    // Reading `offsetWidth` in the callback would be a layout read on every
    // resize frame; `contentRect` is already computed. The two are made to
    // disagree here so it is clear which one answered.
    render(2);
    expect(source!.getSlotSize()).toBe(200);

    act(() => latest().emit(800));

    expect(source!.getSlotSize()).toBe(400);
    expect(source!.slotPx).toBe(400);
  });

  it("throws away a resize under the viewport epsilon", () => {
    // Sub-pixel jitter arrives constantly on a zoomed or fractional-DPI
    // display; re-measuring on it would notify the track — and tear down a
    // compositor ride — several times a second for nothing.
    render(2);
    act(() => latest().emit(800));
    const after = source!.getSlotSize();
    moves = 0;

    act(() => latest().emit(800 + VIEWPORT_EPSILON_PX - 0.1));
    expect(source!.getSlotSize()).toBe(after);
    expect(moves).toBe(0);

    act(() => latest().emit(800 + VIEWPORT_EPSILON_PX));
    expect(source!.getSlotSize()).not.toBe(after);
    expect(moves).toBe(1);
  });

  it("falls back to the layout box when the entry carries no usable width", () => {
    // A missing entry, a non-numeric width, an Infinity: the observer still
    // fired for a reason, so the answer is a full re-measure rather than
    // silence.
    render(2);
    act(() => latest().emit(800));
    expect(source!.getSlotSize()).toBe(400);

    layoutWidth = 600;
    act(() => latest().emit(Number.POSITIVE_INFINITY));
    expect(source!.getSlotSize()).toBe(300);

    layoutWidth = 1000;
    act(() => latest().emit("wide"));
    expect(source!.getSlotSize()).toBe(500);
  });

  it("survives a notification that carries no entry", () => {
    // The spec allows an empty batch, and reading `[0].contentRect` blindly
    // throws inside an observer callback — where nothing catches it, and the
    // deck simply stops re-measuring for the rest of the session.
    render(2);
    layoutWidth = 900;

    const blown: string[] = [];
    const onError = (e: ErrorEvent) => blown.push(e.message);
    window.addEventListener("error", onError);
    act(() => latest().emitEmpty());
    window.removeEventListener("error", onError);

    expect(blown).toEqual([]);
    // And it still did the honest thing: no width to trust, so re-measure.
    expect(source!.getSlotSize()).toBe(450);
  });

  it("keeps the published px still through sub-pixel drift, but not the live value", () => {
    // The published value is state: moving it re-renders every consumer that
    // reads it. The live value is what the track paints from, so it is never
    // rounded and never damped.
    render(2);
    act(() => latest().emit(800));
    expect(source!.slotPx).toBe(400);

    act(() => latest().emit(801.5)); // slot 400.75, under the 1px slot epsilon
    expect(source!.slotPx).toBe(400);
    expect(source!.getSlotSize()).toBe(400.75);
  });
});

describe("the window resize the observer does not cover", () => {
  it("re-measures on it, and stops listening on unmount", () => {
    render(2);
    layoutWidth = 1200;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(source!.getSlotSize()).toBe(600);

    // A leaked listener is observable through the source itself: the hook is
    // gone, React has emptied the viewport ref, so a re-measure that still
    // fires would find no viewport and blank the slot. Holding at 600 is the
    // proof the listener came off.
    const orphaned = source!;
    act(() => root.unmount());
    root = createRoot(host);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(orphaned.getSlotSize()).toBe(600);
  });
});

describe("a deck with no viewport left to measure", () => {
  it("clears the slot and tells the track it moved", () => {
    // The node can go while the hook stays (a collapsed layout, a suspended
    // subtree). Keeping the last slot would leave the track converting pixels
    // against a deck that is no longer on screen.
    render(2);
    expect(source!.getSlotSize()).toBe(200);
    moves = 0;

    render(3, false);

    expect(source!.getSlotSize()).toBeNull();
    expect(moves).toBe(1);
  });

  it("says nothing the second time there is still nothing", () => {
    // "The slot moved" has to mean it moved. Reporting a move on every
    // re-measure of an absent deck would tear down a compositor ride on each
    // render of a collapsed layout.
    render(2, false);
    moves = 0;

    render(3, false);
    render(4, false);

    expect(source!.getSlotSize()).toBeNull();
    expect(moves).toBe(0);
  });
});
