// @vitest-environment jsdom
/**
 * FORK of `shared/engines/gesture/tests/nativeListeners.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";

/**
 * The two NATIVE listeners the hook installs on its host — and the only place
 * where the engine argues with the browser itself.
 *
 * `touchmove` is the boundary between this gesture and the page's own scroll:
 * prevent it too eagerly and a vertical swipe stops scrolling the page over
 * the deck; prevent it too late and a horizontal drag fights the scroller for
 * the same finger. React cannot express it — the listener must be non-passive,
 * so it is attached by hand.
 *
 * `click` is the other half of a drag: a finger that dragged must not leave a
 * click behind on whatever was under it. The exception is a control the press
 * was handed back to, which must still click.
 *
 * Neither had a test: 41 of their mutants had no coverage at all.
 */

let container: HTMLDivElement;
let root: Root;
let host: HTMLElement;

const pointer = (
  type: string,
  { x, y, t }: { x: number; y: number; t?: number },
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

/** A touch event jsdom can carry: only `touches` and `cancelable` are read. */
const touchMove = (
  points: Array<{ x: number; y: number }>,
  { cancelable = true } = {},
): Event => {
  const event = new Event("touchmove", { bubbles: true, cancelable });
  Object.defineProperty(event, "touches", {
    value: points.map((p) => ({ clientX: p.x, clientY: p.y })),
  });
  return event;
};

const click = (target: Element, { t }: { t?: number } = {}): Event => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  target.dispatchEvent(event);
  return event;
};

const fire = (target: EventTarget, event: Event) => {
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

/** Host with a button inside it — the click exception needs a real control. */
function Rig({ enabled = true }: { enabled?: boolean }) {
  const { hostProps } = usePointerSwipe({
    enabled,
    config: { intentThreshold: 8, cooldownMs: 300 },
  });
  return (
    <div {...hostProps} data-host="">
      <button type="button">press me</button>
      <span data-plain="">deck</span>
    </div>
  );
}

const mount = (enabled = true) => {
  act(() => root.render(<Rig enabled={enabled} />));
  host = container.querySelector("[data-host]") as HTMLElement;
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("touchmove — the border with the page's own scroll", () => {
  it("is left alone while nothing is happening", () => {
    // Idle host: the page scrolls over the deck like over any other element.
    // The point is deliberately far and horizontal — measured against the
    // stale gesture origin (0, 0) it WOULD look like our pull, so this is the
    // phase check answering, not the arithmetic.
    mount();
    const event = fire(host, touchMove([{ x: 200, y: 10 }]));
    expect(event.defaultPrevented).toBe(false);
  });

  it("is taken over completely once the drag owns the finger", () => {
    // In `dragging` the direction no longer matters: the gesture owns the
    // pointer, and a page that scrolls under it tears the deck sideways.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 140, y: 100, t: 16 }));

    const vertical = fire(host, touchMove([{ x: 140, y: 300 }]));
    expect(vertical.defaultPrevented).toBe(true);
  });

  it("is taken during a press only once the pull is clearly horizontal", () => {
    // The press phase is the undecided one: the finger is down but the engine
    // has not claimed it. Claim the scroll here and a vertical swipe that
    // started on the deck stops scrolling the page.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));

    const small = fire(host, touchMove([{ x: 104, y: 100 }]));
    expect(small.defaultPrevented).toBe(false);

    const vertical = fire(host, touchMove([{ x: 100, y: 140 }]));
    expect(vertical.defaultPrevented).toBe(false);

    // Past the threshold AND more horizontal than vertical: ours.
    const horizontal = fire(host, touchMove([{ x: 140, y: 108 }]));
    expect(horizontal.defaultPrevented).toBe(true);
  });

  it("leaves a diagonal pull to the page while the vertical part leads", () => {
    // Equal parts are not ours either: the rule is strictly "more horizontal".
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));
    const diagonal = fire(host, touchMove([{ x: 140, y: 140 }]));
    expect(diagonal.defaultPrevented).toBe(false);
  });

  it("does not even try on an event the browser has already committed", () => {
    // A non-cancelable touchmove cannot be prevented — `defaultPrevented`
    // stays false either way, so the flag cannot answer this. What must not
    // happen is the CALL: every browser logs it as an error, and a listener
    // that makes it on every frame of a scroll fills the console with noise.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 140, y: 100, t: 16 }));

    const event = touchMove([{ x: 200, y: 100 }], { cancelable: false });
    let tried = 0;
    event.preventDefault = () => {
      tried += 1;
    };
    fire(host, event);

    expect(tried).toBe(0);
  });

  it("survives a touchmove that carries no touches", () => {
    // The list can be empty (a cancelled sequence). Reading `[0]` blindly
    // throws INSIDE a native listener, where nothing catches it — the flag on
    // the event says nothing, so the failure is caught at the window.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));

    const blown: string[] = [];
    const onError = (e: ErrorEvent) => blown.push(e.message);
    window.addEventListener("error", onError);
    fire(host, touchMove([]));
    window.removeEventListener("error", onError);

    expect(blown).toEqual([]);
  });

  it("stops being the engine's business when the hook is disabled", () => {
    mount(false);
    const event = fire(host, touchMove([{ x: 200, y: 100 }]));
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("click — what a drag must not leave behind", () => {
  /** Drag the deck and lift: the cooldown window opens at `t`. */
  const dragAndLift = (t: number) => {
    fire(host, pointer("pointerdown", { x: 100, y: 100, t: 0 }));
    fire(host, pointer("pointermove", { x: 140, y: 100, t: 16 }));
    fire(host, pointer("pointerup", { x: 160, y: 100, t }));
  };

  it("is swallowed on whatever the finger dragged over", () => {
    // Without this the deck both slides AND opens the slide under the finger.
    mount();
    dragAndLift(30);
    const deck = container.querySelector("[data-plain]") as Element;

    const event = click(deck, { t: 100 });
    expect(event.defaultPrevented).toBe(true);
  });

  it("passes again from the very instant the cooldown ends", () => {
    mount();
    dragAndLift(30);
    const deck = container.querySelector("[data-plain]") as Element;

    // The window is [release, release + cooldownMs); at its closing instant
    // the click is already the user's. Tested ON the boundary, because a
    // window that is one tick too long is invisible anywhere else.
    expect(click(deck, { t: 329 }).defaultPrevented).toBe(true);
    expect(click(deck, { t: 330 }).defaultPrevented).toBe(false);
    expect(click(deck, { t: 1000 }).defaultPrevented).toBe(false);
  });

  it("still reaches a control the press was handed back to", () => {
    // A press on a control during the cooldown is handed back rather than
    // dragged; the click that follows it is the user's, not the deck's.
    mount();
    dragAndLift(30);
    const button = container.querySelector("button") as HTMLElement;

    fire(button, pointer("pointerdown", { x: 100, y: 100, t: 60 }));
    const allowed = click(button, { t: 70 });
    expect(allowed.defaultPrevented).toBe(false);

    // The pass is spent: the next click inside the same window is swallowed
    // again, or one handback would open the door for the whole cooldown.
    const next = click(button, { t: 80 });
    expect(next.defaultPrevented).toBe(true);
  });

  it("is left alone entirely when the hook is disabled", () => {
    mount(false);
    const deck = container.querySelector("[data-plain]") as Element;
    const event = click(deck, { t: 10 });
    expect(event.defaultPrevented).toBe(false);
  });
});
