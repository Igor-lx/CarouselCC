// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";
import type { PointerSwipeReleasePayload } from "../swipe/types";

/**
 * Who gets in, and what the phases do with them.
 *
 * The engine answers only to a primary touch on the main button, and only
 * when it is enabled: every other pointer belongs to somebody else, and a
 * mouse that starts dragging the deck is a bug the user meets on their first
 * desktop click. After a drag it also refuses the finger for a cooldown, so
 * the lift that ended one gesture cannot start the next.
 *
 * Inside a gesture the phases decide direction: below the intent threshold
 * nothing has been decided yet, a vertical pull hands the finger back to the
 * page, and only a horizontal one becomes a drag.
 */

let container: HTMLDivElement;
let root: Root;
let host: HTMLElement;

interface Seen {
  presses: number;
  dragStarts: number;
  moves: number;
  releases: PointerSwipeReleasePayload[];
}

let seen: Seen;

const pointer = (
  type: string,
  {
    x,
    y,
    t,
    id = 1,
    kind = "touch",
    primary = true,
    button = 0,
    cancelable = true,
  }: {
    x: number;
    y: number;
    t?: number;
    id?: number;
    kind?: string;
    primary?: boolean;
    button?: number;
    cancelable?: boolean;
  },
): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable,
    clientX: x,
    clientY: y,
    button,
  });
  Object.defineProperty(event, "pointerId", { value: id });
  Object.defineProperty(event, "pointerType", { value: kind });
  Object.defineProperty(event, "isPrimary", { value: primary });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const fire = (target: EventTarget, event: Event) => {
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

function Rig({ enabled = true }: { enabled?: boolean }) {
  const { hostProps } = usePointerSwipe({
    enabled,
    // No catch window: ownership is decided by movement alone, which is what
    // these tests are about.
    config: { catchDelayMs: 0, intentThreshold: 8, cooldownMs: 300 },
    onPressStart: () => {
      seen.presses += 1;
    },
    onDragStart: () => {
      seen.dragStarts += 1;
    },
    onDragMove: () => {
      seen.moves += 1;
    },
    onRelease: (payload) => {
      seen.releases.push(payload);
    },
  });
  return (
    <div {...hostProps} data-host="">
      <button type="button">chrome</button>
    </div>
  );
}

const mount = (enabled = true) => {
  act(() => root.render(<Rig enabled={enabled} />));
  host = container.querySelector("[data-host]") as HTMLElement;
};

/** A completed horizontal drag, ending at `t`. */
const dragAndLift = (t = 32) => {
  fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
  fire(host, pointer("pointermove", { x: 150, y: 40, t: 16 }));
  fire(host, pointer("pointerup", { x: 170, y: 40, t }));
};

beforeEach(() => {
  seen = { presses: 0, dragStarts: 0, moves: 0, releases: [] };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("who the engine answers to", () => {
  it("ignores a mouse", () => {
    // The engine is touch-only by declaration. A mouse that drags the deck
    // steals text selection and every click on the way.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0, kind: "mouse" }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 16, kind: "mouse" }));

    expect(seen.presses).toBe(0);
    expect(seen.dragStarts).toBe(0);
  });

  it("ignores a second finger", () => {
    // Not primary: a pinch's second contact must not restart the gesture
    // under the first one.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0, primary: false }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 16 }));

    expect(seen.presses).toBe(0);
    expect(seen.dragStarts).toBe(0);
  });

  it("ignores a press that is not the main button", () => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0, button: 2 }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 16 }));

    expect(seen.presses).toBe(0);
    expect(seen.dragStarts).toBe(0);
  });

  it("hands the host nothing but the ref while disabled", () => {
    // Disabled is not "listens and does nothing": the handlers are not there
    // at all, so a consumer can rely on the deck being inert.
    mount(false);
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 16 }));
    fire(host, pointer("pointerup", { x: 170, y: 40, t: 32 }));

    expect(seen.presses).toBe(0);
    expect(seen.dragStarts).toBe(0);
    expect(seen.releases).toEqual([]);
  });
});

describe("the cooldown after a drag", () => {
  it("refuses the next press until it runs out", () => {
    // The lift that ended a drag must not start the next gesture: fingers
    // bounce, and a deck that re-grabs on the bounce feels stuck.
    mount();
    dragAndLift(32);
    expect(seen.dragStarts).toBe(1);

    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 100 }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 116 }));

    expect(seen.dragStarts).toBe(1);
    expect(seen.presses).toBe(1);
  });

  it("takes the finger again once it has run out", () => {
    mount();
    dragAndLift(32);

    // cooldownMs = 300, measured from the lift.
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 400 }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 416 }));

    expect(seen.dragStarts).toBe(2);
  });
});

describe("the phases inside a gesture", () => {
  it("does nothing for a pull that has not decided yet", () => {
    // Below the threshold the gesture is still nobody's: no drag, no value
    // written, and the page may still scroll.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 105, y: 44, t: 16 }));

    expect(seen.dragStarts).toBe(0);
    expect(seen.moves).toBe(0);
  });

  it("hands a vertical pull back to the page", () => {
    // Past the threshold but more vertical: the page scrolls, and the gesture
    // ends as `vertical-scroll` rather than a release with a direction.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 104, y: 100, t: 16 }));

    expect(seen.dragStarts).toBe(0);
    expect(seen.releases).toHaveLength(1);
    expect(seen.releases[0]!.endReason).toBe("vertical-scroll");
    expect(seen.releases[0]!.direction).toBe("none");
  });

  it("stays out after handing the finger back", () => {
    // The gesture is over: a horizontal pull with the same finger cannot
    // revive it, or a scroll that drifts sideways turns into a drag.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 104, y: 100, t: 16 }));
    fire(host, pointer("pointermove", { x: 200, y: 100, t: 32 }));

    expect(seen.dragStarts).toBe(0);
  });

  it("becomes a drag on a horizontal pull", () => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, y: 44, t: 16 }));

    expect(seen.dragStarts).toBe(1);
    // The activating move is a move as well: the consumer gets the offset it
    // just decided on, not only the announcement.
    expect(seen.moves).toBe(1);
  });

  it("decides an exact diagonal once, for both of its rules", () => {
    // A 45° pull is the tie, and the engine holds TWO rules about it: the
    // pointer path decides ownership (`absY > absX` → the page), and the
    // native `touchmove` listener enforces that decision by preventing the
    // scroll. They must agree on the tie, or the deck drags while the page
    // scrolls under it for exactly one frame — the jerk a user reads as
    // "the deck slipped".
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));

    const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(scroll, "touches", {
      value: [{ clientX: 140, clientY: 80 }],
    });
    fire(host, scroll);
    fire(host, pointer("pointermove", { x: 140, y: 80, t: 16 }));

    const claimed = seen.dragStarts === 1;
    expect(scroll.defaultPrevented).toBe(claimed);
  });

  it("ignores events from a finger it is not following", () => {
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));
    fire(host, pointer("pointermove", { x: 150, y: 40, t: 16, id: 7 }));

    expect(seen.dragStarts).toBe(0);
  });

  it("claims the browser's default only while it can", () => {
    // Same rule as the native listener: prevent what can be prevented, and
    // do not call it on what cannot.
    mount();
    fire(host, pointer("pointerdown", { x: 100, y: 40, t: 0 }));

    const deciding = fire(
      host,
      pointer("pointermove", { x: 150, y: 40, t: 16 }),
    );
    expect(deciding.defaultPrevented).toBe(true);

    const dragging = fire(
      host,
      pointer("pointermove", { x: 180, y: 40, t: 32 }),
    );
    expect(dragging.defaultPrevented).toBe(true);

    const uncancelable = pointer("pointermove", {
      x: 200,
      y: 40,
      t: 48,
      cancelable: false,
    });
    let tried = 0;
    uncancelable.preventDefault = () => {
      tried += 1;
    };
    fire(host, uncancelable);
    expect(tried).toBe(0);
  });
});
