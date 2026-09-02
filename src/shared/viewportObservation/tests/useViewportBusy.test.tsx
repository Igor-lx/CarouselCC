// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useViewportBusy } from "../useViewportBusy";

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

const Probe = ({
  enabled,
  quietDelayMs = 600,
}: {
  enabled: boolean;
  quietDelayMs?: number;
}) => {
  renders += 1;
  getBusy = useViewportBusy({ enabled, quietDelayMs });
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

describe("useViewportBusy — the edge of the quiet window", () => {
  it("is busy up to the delay and quiet AT it", () => {
    // The window is what autoplay waits out. One tick too long and every
    // scroll costs an extra interval; one too short and the tick lands in the
    // middle of a fling.
    mount(true);
    fire("touchstart", 1);
    fire("touchend", 0);

    advance(599);
    expect(getBusy()).toBe(true);

    advance(1);
    expect(getBusy()).toBe(false);
  });

  it("follows a delay the consumer changes without remounting", () => {
    // The settings are mirrored into refs after the commit precisely so the
    // getter — polled from a timer, never from a render — sees the current
    // ones rather than the ones it closed over.
    mount(true);
    fire("touchstart", 1);
    fire("touchend", 0);
    advance(599);
    expect(getBusy()).toBe(true);

    act(() => {
      root.render(<Probe enabled={true} quietDelayMs={100} />);
    });

    // 599ms have passed and the window is now 100ms: already quiet.
    expect(getBusy()).toBe(false);
  });
});

describe("useViewportBusy — the mobile chrome", () => {
  it("counts a visual-viewport resize as activity", () => {
    // The URL bar collapsing resizes the VISUAL viewport without resizing the
    // window. Missing it lets autoplay tick in the middle of that reflow.
    // jsdom ships no `visualViewport`, so it is stubbed here — which is also
    // why the hook reaches for it optionally.
    const visual = new EventTarget();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visual,
    });

    mount(true);
    advance(1000);
    expect(getBusy()).toBe(false);

    act(() => {
      visual.dispatchEvent(new Event("resize"));
    });
    expect(getBusy()).toBe(true);

    act(() => root.unmount());
    advance(1000);
    // And it lets go of that listener too.
    act(() => {
      visual.dispatchEvent(new Event("resize"));
    });
    expect(getBusy()).toBe(false);

    Reflect.deleteProperty(window, "visualViewport");
  });

  it("does not reach for a visual viewport that is not there", () => {
    // Safari on desktop and every non-browser runtime have none; reading it
    // blindly throws inside an effect, which unmounts the whole host tree.
    expect(window.visualViewport).toBeUndefined();
    expect(() => mount(true)).not.toThrow();
  });
});

describe("useViewportBusy — letting go", () => {
  it("removes every listener and forgets the last signal on unmount", () => {
    // The listeners are on `document` and `window`, not on a node React owns,
    // so nothing removes them for us. A leaked one keeps a dead carousel's
    // refs alive and answering.
    mount(true);
    fire("touchstart", 1);
    expect(getBusy()).toBe(true);

    const orphaned = getBusy;
    act(() => root.unmount());

    // Teardown forgot the finger and the timestamp…
    expect(orphaned()).toBe(false);

    // …and nothing reaches it any more.
    fire("touchstart", 2);
    fireWindow("scroll");
    expect(orphaned()).toBe(false);
  });
});
