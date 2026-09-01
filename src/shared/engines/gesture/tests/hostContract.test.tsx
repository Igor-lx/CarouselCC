// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";
import type {
  PointerSwipeHostProps,
  PointerSwipeReleasePayload,
} from "../swipe/types";

/**
 * The bundle the hook hands its host, and the browser behaviour that bundle
 * buys.
 *
 * `hostProps` is not a convenience: the styles in it are the engine's claim on
 * the finger. `touch-action: pan-y` is what makes a horizontal drag reach
 * JavaScript at all — without it the compositor scrolls the page and the
 * pointer events arrive already cancelled. The rest stop a drag from selecting
 * text, rubber-banding the page, or flashing a tap highlight. None of it can
 * be observed in jsdom by behaviour, so it is pinned as the declaration it is.
 *
 * The rest of this file is the timing the engine runs on: the clock it reads,
 * the cooldown it holds the finger off for, and the edges of the two
 * thresholds that decide whether a pull is a drag at all.
 */

let container: HTMLDivElement;
let root: Root;
let host: HTMLElement;
let releases: PointerSwipeReleasePayload[];
let lastHostProps: PointerSwipeHostProps;
let starts: number;
let dragStarts: number;

const COOLDOWN = 300;
const THRESHOLD = 8;

const pointer = (
  type: string,
  { x, y = 40, t }: { x: number; y?: number; t?: number },
): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const fire = (target: EventTarget, event: Event) => {
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const click = (target: Element, { t }: { t?: number } = {}): Event => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  target.dispatchEvent(event);
  return event;
};

interface RigProps {
  enabled?: boolean;
  width?: number;
  hostRef?: RefObject<HTMLElement | null>;
  callbackRef?: (node: HTMLElement | null) => void;
  withValue?: boolean;
}

let boundValue: number;

function Rig({
  enabled = true,
  width = 400,
  hostRef,
  callbackRef,
  withValue = false,
}: RigProps) {
  const valueRef = useRef({
    read: () => boundValue,
    write: (next: number) => {
      boundValue = next;
    },
  });

  const { hostProps } = usePointerSwipe({
    enabled,
    ...(hostRef ? { hostRef } : {}),
    ...(callbackRef ? { hostRef: callbackRef } : {}),
    ...(withValue ? { value: valueRef.current } : {}),
    config: {
      catchDelayMs: 0,
      intentThreshold: THRESHOLD,
      cooldownMs: COOLDOWN,
    },
    onPressStart: () => {
      starts += 1;
    },
    onDragStart: () => {
      dragStarts += 1;
    },
    onRelease: (payload) => {
      releases.push(payload);
    },
  });
  lastHostProps = hostProps;
  return (
    <div {...hostProps} data-host="" style={{ ...hostProps.style, width }}>
      <button type="button">press me</button>
      <span data-plain="">deck</span>
    </div>
  );
}

const mount = (props: RigProps = {}) => {
  act(() => root.render(<Rig {...props} />));
  host = container.querySelector("[data-host]") as HTMLElement;
  Object.defineProperty(host, "offsetWidth", {
    configurable: true,
    value: props.width ?? 400,
  });
};

const lastRelease = () => releases[releases.length - 1]!;

beforeEach(() => {
  releases = [];
  starts = 0;
  dragStarts = 0;
  boundValue = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the styles the engine claims the finger with", () => {
  it("declares every one of them", () => {
    // `pan-y` is the load-bearing one: it tells the compositor that vertical
    // scrolling is the page's and horizontal is ours. Drop it and a horizontal
    // drag never reaches this hook. The other four stop a drag from selecting
    // text, over-scrolling the page sideways, or flashing a tap highlight.
    mount();

    expect(lastHostProps.style).toMatchObject({
      touchAction: "pan-y",
      userSelect: "none",
      WebkitUserSelect: "none",
      overscrollBehaviorX: "contain",
      WebkitTapHighlightColor: "transparent",
    });
  });

  it("keeps the same style object across renders", () => {
    // Spread onto a host every render: a fresh object each time would rewrite
    // the element's inline style on every parent render.
    mount();
    const first = lastHostProps.style;
    mount();

    expect(lastHostProps.style).toBe(first);
  });

  it("hands out the ref alone while disabled, and nothing else", () => {
    // Disabled means inert, not "listens and ignores": the consumer can rely
    // on there being no handlers and no styles at all — but the ref stays, or
    // re-enabling would find no node.
    mount({ enabled: false });

    expect(Object.keys(lastHostProps)).toEqual(["ref"]);
    expect(lastHostProps.style).toBeUndefined();
  });
});

describe("the host ref, in both shapes a consumer can pass", () => {
  it("fills an object ref with the node, and empties it on unmount", () => {
    const external: RefObject<HTMLElement | null> = { current: null };
    mount({ hostRef: external });

    expect(external.current).toBe(host);

    act(() => root.unmount());
    expect(external.current).toBeNull();
  });

  it("calls a callback ref with the node, and again with null", () => {
    // The function shape had no test at all: the branch that calls it was
    // never executed, so the engine could have silently stopped forwarding
    // the node to any consumer using the idiomatic React form.
    const seen: Array<HTMLElement | null> = [];
    mount({ callbackRef: (node) => seen.push(node) });

    expect(seen[0]).toBeInstanceOf(HTMLElement);

    act(() => root.unmount());
    expect(seen.at(-1)).toBeNull();
  });
});

describe("the clock the engine reads events on", () => {
  it("does not date an event that carries no time to the epoch", () => {
    // Only the NATIVE listeners can see a zero here: React substitutes
    // `Date.now()` for a zero `timeStamp` before a synthetic event reaches
    // any handler, so the fallback's live path is the click suppressor.
    //
    // A click with no time of its own must not be read as time zero, or it
    // falls inside every cooldown window that ever opened and is swallowed
    // long after the drag that opened it ended.
    mount();
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointerup", { x: 170, t: 30 }));
    const deck = container.querySelector("[data-plain]") as Element;

    const timeless = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(timeless, "timeStamp", { value: 0 });
    deck.dispatchEvent(timeless);

    expect(timeless.defaultPrevented).toBe(false);
    // And one that IS inside the window is still swallowed, so the assertion
    // above is about the missing time rather than about the window.
    expect(click(deck, { t: 100 }).defaultPrevented).toBe(true);
  });
});

describe("the cooldown the next finger is held off for", () => {
  /** Drag and lift at `t`, opening the cooldown window. */
  const dragAndLift = (t: number) => {
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointerup", { x: 170, t }));
  };

  it("opens only for a press that actually became a drag", () => {
    // A tap is not a drag: it must leave the deck immediately usable, and the
    // click it produces belongs to whatever was under it.
    mount();
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointerup", { x: 100, t: 20 }));

    const deck = container.querySelector("[data-plain]") as Element;
    expect(click(deck, { t: 30 }).defaultPrevented).toBe(false);
  });

  it("refuses a new press up to the last instant of the window", () => {
    // The window is [release, release + cooldownMs). Read the boundary as
    // "at or after" and the finger is refused one tick too long — a real
    // second swipe that a user makes immediately is silently dropped.
    mount();
    dragAndLift(30);
    starts = 0;

    fire(host, pointer("pointerdown", { x: 100, t: 329 }));
    fire(host, pointer("pointermove", { x: 150, t: 340 }));
    expect(starts).toBe(0);

    fire(host, pointer("pointerdown", { x: 100, t: 330 }));
    fire(host, pointer("pointermove", { x: 150, t: 346 }));
    expect(starts).toBe(1);
  });
});

describe("a press on a control while the deck is cooling down", () => {
  const dragAndLift = (t: number) => {
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointerup", { x: 170, t }));
  };

  it("is handed back up to the last instant of the window, and not after", () => {
    // Inside the window the press belongs to the control, so its click is
    // let through once. At the closing instant the deck is the user's again
    // and the ordinary suppression no longer applies to anything.
    mount();
    dragAndLift(30);
    const button = container.querySelector("button") as HTMLElement;

    fire(button, pointer("pointerdown", { x: 100, t: 329 }));
    expect(click(button, { t: 329 }).defaultPrevented).toBe(false);
    // Handed back, not grabbed: the press never became a gesture.
    expect(starts).toBe(1); // only the drag above

    // At 330 the window is closed and the control has no special standing:
    // the press is an ordinary press and the engine takes it.
    fire(button, pointer("pointerdown", { x: 100, t: 330 }));
    expect(starts).toBe(2);
  });
});

describe("the edges of the two rules that make a pull a drag", () => {
  it("needs to pass the intent threshold, not merely reach it", () => {
    // At exactly the threshold nothing is decided yet: the finger has moved
    // as far as a resting hand does. Read it as "at least" and a hand tremor
    // of exactly 8px claims the gesture off the page.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 100 + THRESHOLD, y: 40, t: 16 }));
    expect(dragStarts).toBe(0);
    expect(releases).toEqual([]);
    // Nothing was claimed: a lift here is a tap, with no direction.
    fire(host, pointer("pointerup", { x: 100 + THRESHOLD, y: 40, t: 32 }));
    expect(lastRelease().direction).toBe("none");
  });

  it("hands the page a vertical pull that only reaches the threshold", () => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 100, y: 40 + THRESHOLD, t: 16 }));

    expect(dragStarts).toBe(0);
    expect(releases).toEqual([]);
  });

  it("enforces the same edge in the native touchmove listener", () => {
    // The listener mirrors the pointer rule; at exactly the threshold neither
    // has claimed anything, so the page must still scroll.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));

    const atEdge = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(atEdge, "touches", {
      value: [{ clientX: 100 + THRESHOLD, clientY: 40 }],
    });
    fire(host, atEdge);
    expect(atEdge.defaultPrevented).toBe(false);

    const past = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(past, "touches", {
      value: [{ clientX: 100 + THRESHOLD + 1, clientY: 40 }],
    });
    fire(host, past);
    expect(past.defaultPrevented).toBe(true);
  });
});

describe("the value the drag writes", () => {
  it("moves the bound value WITH the finger, from the anchor it read", () => {
    // `anchor + uiOffset`. Subtract instead and the bound element runs away
    // from the finger at twice the speed.
    boundValue = 25;
    mount({ withValue: true });
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointermove", { x: 200, t: 32 }));

    // The activation write is anchored (its offset is zero by construction);
    // the writes that follow are the ones that carry the finger.
    expect(boundValue).toBeGreaterThan(25);
  });
});

describe("what the engine tears down with itself", () => {
  it("stops suppressing clicks once it is gone", () => {
    // The click listener is native and installed by hand; leaving it on the
    // node after unmount swallows every click on that subtree forever.
    mount();
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointerup", { x: 170, t: 30 }));
    const deck = container.querySelector("[data-plain]") as Element;
    expect(click(deck, { t: 40 }).defaultPrevented).toBe(true);

    const detached = host;
    act(() => root.unmount());

    // Timed INSIDE the cooldown window the drag opened: outside it the
    // listener would decline anyway and the assertion would prove nothing.
    const after = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(after, "timeStamp", { value: 50 });
    detached.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("stops claiming touchmove once it is gone", () => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));

    const detached = host;
    act(() => root.unmount());

    const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(scroll, "touches", {
      value: [{ clientX: 300, clientY: 40 }],
    });
    detached.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });
});

describe("the two ways the browser takes the pointer away", () => {
  const dragThen = (type: string) => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, t: 16 }));
    fire(host, pointer("pointermove", { x: 220, t: 32 }));
    fire(host, pointer(type, { x: 220, t: 48 }));
    return lastRelease();
  };

  it("treats a cancelled pointer as an external cancel", () => {
    expect(dragThen("pointercancel").endReason).toBe("external-cancel");
    expect(lastRelease().direction).toBe("none");
  });

  it("treats a lost capture the same way", () => {
    // A separate handler for the same meaning: the browser can take the
    // pointer either by cancelling it or by revoking the capture, and a deck
    // that commits a page on one but not the other is a coin toss.
    expect(dragThen("lostpointercapture").endReason).toBe("external-cancel");
    expect(lastRelease().direction).toBe("none");
  });
});

describe("the width the commit distance is measured against", () => {
  it("comes from the host element, not from a stand-in", () => {
    // 400px wide → 20 % is 80px, and the resistance factor (1 − 0.7) brings
    // the commit distance to 24px. Lose the width and the floor
    // (`minSwipeDistance`, 20px) takes over — a 22px pull would then turn the
    // page that the honest reading leaves alone.
    mount({ width: 400 });
    fire(host, pointer("pointerdown", { x: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 111, t: 200 }));
    fire(host, pointer("pointermove", { x: 122, t: 400 }));
    fire(host, pointer("pointerup", { x: 122, t: 600 }));

    expect(lastRelease().direction).toBe("none");
  });
});
