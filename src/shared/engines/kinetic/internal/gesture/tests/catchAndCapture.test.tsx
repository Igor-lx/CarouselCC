// @vitest-environment jsdom
/**
 * FORK of `shared/engines/gesture/tests/catchAndCapture.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";

/**
 * Two mechanisms that decide whether a finger OWNS the deck, and neither had
 * a test.
 *
 * The catch window is what makes a resting finger a brake: a press that
 * outlasts it takes the deck (an in-flight ride is caught and held), while a
 * press that lifts inside it was a tap and must leave no trace. Too eager and
 * every tap steals the pointer; too slow and the deck runs on under a finger
 * that meant to stop it.
 *
 * Pointer capture is what keeps the drag alive when the finger leaves the
 * element. jsdom implements neither call, so the engine's `try/catch` swallows
 * them and the whole branch stayed dark — the stubs below are what a browser
 * would have provided.
 */

let container: HTMLDivElement;
let root: Root;
let host: HTMLElement;

const captured: number[] = [];
const released: number[] = [];
let captureThrows = false;

const pointer = (
  type: string,
  { x, y, t, id = 1 }: { x: number; y: number; t?: number; id?: number },
): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: id });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const fire = (target: EventTarget, event: Event) => {
  act(() => {
    target.dispatchEvent(event);
  });
};

interface Seen {
  presses: number[];
  dragStarts: number;
  releases: number;
}

let seen: Seen;

function Rig({ catchDelayMs = 250 }: { catchDelayMs?: number }) {
  const { hostProps } = usePointerSwipe({
    config: { catchDelayMs, intentThreshold: 8 },
    onPressStart: ({ pressClientX }) => {
      seen.presses.push(pressClientX);
    },
    onDragStart: () => {
      seen.dragStarts += 1;
    },
    onRelease: () => {
      seen.releases += 1;
    },
  });
  return <div {...hostProps} data-host="" />;
}

/** The capture API a browser has and jsdom does not. */
const equipCapture = (element: HTMLElement) => {
  Object.assign(element, {
    setPointerCapture: (id: number) => {
      if (captureThrows) throw new Error("capture refused");
      captured.push(id);
    },
    releasePointerCapture: (id: number) => {
      released.push(id);
    },
  });
};

const mount = (catchDelayMs = 250) => {
  act(() => root.render(<Rig catchDelayMs={catchDelayMs} />));
  host = container.querySelector("[data-host]") as HTMLElement;
  equipCapture(host);
};

beforeEach(() => {
  seen = { presses: [], dragStarts: 0, releases: 0 };
  captured.length = 0;
  released.length = 0;
  captureThrows = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("the catch window — when a resting finger becomes a brake", () => {
  it("takes the deck once the press outlasts the window", () => {
    vi.useFakeTimers();
    mount(250);
    fire(host, pointer("pointerdown", { x: 120, y: 40, t: 0 }));
    expect(seen.presses).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Reported at the point the finger LANDED, not where it drifted to: the
    // consumer settles the deck back onto the pressed element.
    expect(seen.presses).toEqual([120]);
  });

  it("stays out of the way for the whole window", () => {
    // One tick short is still a tap: the boundary is the rule, and a window
    // that fires early makes every tap steal the pointer.
    vi.useFakeTimers();
    mount(250);
    fire(host, pointer("pointerdown", { x: 120, y: 40, t: 0 }));

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(seen.presses).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(seen.presses).toEqual([120]);
  });

  it("a lift inside the window leaves nothing behind", () => {
    // The tap case. The pending catch must die with the gesture — otherwise
    // the deck is caught a quarter second after the finger is already gone.
    vi.useFakeTimers();
    mount(250);
    fire(host, pointer("pointerdown", { x: 120, y: 40, t: 0 }));
    fire(host, pointer("pointerup", { x: 120, y: 40, t: 100 }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(seen.presses).toEqual([]);
    expect(seen.releases).toBe(0);
  });

  it("a drag inside the window takes ownership straight away", () => {
    // Movement past the threshold is a decision by itself: it must not wait
    // out the rest of the window, and it must not fire ownership twice.
    vi.useFakeTimers();
    mount(250);
    fire(host, pointer("pointerdown", { x: 120, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 160, y: 40, t: 16 }));

    expect(seen.presses).toEqual([120]);
    expect(seen.dragStarts).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(seen.presses).toEqual([120]);
  });

  it("announces the catch once, even when the finger then drags on", () => {
    // The real sequence of a catch: the finger rests until the deck is
    // caught, and only then pulls. Ownership is already taken, so the second
    // claim must be silent — a consumer that hears two press-starts settles
    // the deck twice and loses the point the finger actually landed on.
    vi.useFakeTimers();
    mount(250);
    fire(host, pointer("pointerdown", { x: 120, y: 40, t: 0 }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(seen.presses).toEqual([120]);

    fire(host, pointer("pointermove", { x: 170, y: 40, t: 300 }));

    expect(seen.presses).toEqual([120]);
    expect(seen.dragStarts).toBe(1);
  });

  it("with no window configured the press owns the deck immediately", () => {
    // `catchDelayMs = 0` is the "no catch phase" setting: a consumer that
    // wants the finger to own the deck from the first touch.
    mount(0);
    fire(host, pointer("pointerdown", { x: 90, y: 40, t: 0 }));
    expect(seen.presses).toEqual([90]);
  });
});

describe("pointer capture — keeping the finger when it leaves the element", () => {
  it("is taken on the press and released when the gesture ends", () => {
    mount(0);
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    expect(captured).toEqual([1]);
    expect(released).toEqual([]);

    fire(host, pointer("pointermove", { x: 140, y: 40, t: 16 }));
    fire(host, pointer("pointerup", { x: 160, y: 40, t: 32 }));

    // Released for the same pointer: holding a capture the gesture no longer
    // owns swallows the next finger anywhere on the page.
    expect(released).toEqual([1]);
  });

  it("is taken once, not on every event that could take it", () => {
    mount(0);
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 140, y: 40, t: 16 }));
    fire(host, pointer("pointermove", { x: 180, y: 40, t: 32 }));

    expect(captured).toEqual([1]);
  });

  it("a refused capture leaves the gesture working", () => {
    // The browser can refuse (the pointer is already gone). The engine has to
    // carry on with the events it still gets — and must not later release a
    // capture it never held.
    captureThrows = true;
    mount(0);
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 140, y: 40, t: 16 }));
    fire(host, pointer("pointerup", { x: 160, y: 40, t: 32 }));

    expect(captured).toEqual([]);
    expect(released).toEqual([]);
    expect(seen.dragStarts).toBe(1);
    expect(seen.releases).toBe(1);
  });
});
