// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";
import type { PointerSwipeReleasePayload } from "../swipe/types";

/**
 * What the gesture remembers at lift-off — the numbers a ride is launched
 * from, and the ones a user judges the deck by.
 *
 * A finger that swipes fast and then STOPS has said something: hold still and
 * the deck should stay. The pause law is what turns that hold into an honest
 * zero instead of a memory of motion a second old. It has a grace (a human
 * cannot lift instantly) and then a half-life.
 *
 * The opposite risk is the mirror of it: a one-pixel twitch at the very
 * instant of lifting must not wipe a real flick, because the terminal sample
 * is judged over the last frames alone.
 */

let container: HTMLDivElement;
let root: Root;
let host: HTMLElement;
let releases: PointerSwipeReleasePayload[];

const GRACE = 120;
const HALF_LIFE = 250;

const pointer = (
  type: string,
  { x, y = 40, t }: { x: number; y?: number; t: number },
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
  Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const fire = (event: Event) => {
  act(() => {
    host.dispatchEvent(event);
  });
};

function Rig({ width = 400 }: { width?: number }) {
  const { hostProps } = usePointerSwipe({
    config: {
      catchDelayMs: 0,
      intentThreshold: 8,
      flickPauseGraceMs: GRACE,
      flickVelocityHalfLifeMs: HALF_LIFE,
      cooldownMs: 0,
    },
    onRelease: (payload) => {
      releases.push(payload);
    },
  });
  return <div {...hostProps} data-host="" style={{ width }} />;
}

const mount = (width = 400) => {
  act(() => root.render(<Rig width={width} />));
  host = container.querySelector("[data-host]") as HTMLElement;
  // jsdom reports 0 for every layout box; the engine reads `offsetWidth`.
  Object.defineProperty(host, "offsetWidth", {
    configurable: true,
    value: width,
  });
};

/** A fast leftward-to-rightward swipe, ending at x = 220 at t = 32. */
const swipeFast = () => {
  fire(pointer("pointerdown", { x: 100, t: 0 }));
  fire(pointer("pointermove", { x: 160, t: 16 }));
  fire(pointer("pointermove", { x: 220, t: 32 }));
};

const lastRelease = () => releases[releases.length - 1]!;

beforeEach(() => {
  releases = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the pause law — a finger that stops has said something", () => {
  /** Lift the finger `pauseMs` after the last movement, without moving it. */
  const holdThenLift = (pauseMs: number) => {
    mount();
    swipeFast();
    fire(pointer("pointerup", { x: 220, t: 32 + pauseMs }));
    return lastRelease();
  };

  it("costs the flick memory nothing inside the grace", () => {
    // Nobody lifts a finger instantly; the grace is what keeps an ordinary
    // fast swipe a fast swipe. Only the two memories live by this law — the
    // per-frame velocities decay by the EMA from the first millisecond, which
    // is a different rule and not this one.
    const immediate = holdThenLift(0);
    const withinGrace = holdThenLift(GRACE - 1);

    expect(immediate.launchVelocity).toBeGreaterThan(0);
    expect(withinGrace.launchVelocity).toBeCloseTo(
      immediate.launchVelocity,
      10,
    );
  });

  it("halves the memory for every half-life held beyond it", () => {
    // The law, on its own terms: one half-life past the grace is half the
    // speed. Asserted as the ratio, so retuning the constants moves the test
    // with the engine instead of breaking it.
    const immediate = holdThenLift(0);
    const oneHalfLife = holdThenLift(GRACE + HALF_LIFE);
    const twoHalfLives = holdThenLift(GRACE + HALF_LIFE * 2);

    expect(oneHalfLife.launchVelocity).toBeCloseTo(
      immediate.launchVelocity / 2,
      6,
    );
    expect(twoHalfLives.launchVelocity).toBeCloseTo(
      immediate.launchVelocity / 4,
      6,
    );
  });

  it("leaves a long hold with nothing worth launching", () => {
    // The case the law exists for: swipe, change your mind, hold, lift. The
    // deck must stay where the finger left it, not fly off at the speed it
    // had a second ago.
    const immediate = holdThenLift(0);
    const held = holdThenLift(1000);

    expect(held.launchVelocity).toBeLessThan(immediate.launchVelocity / 8);
    expect(held.pointerReleaseVelocity).toBeLessThan(
      immediate.pointerReleaseVelocity / 8,
    );
    // And with no speed left there is no flick to commit on.
    expect(held.direction).toBe("right");
  });

  it("applies to every velocity the release carries, not some of them", () => {
    // Four numbers leave this gesture and they describe the same finger. Decay
    // two and keep two and the consumer gets a deck that is both stopped and
    // flying, depending on which field it reads.
    const immediate = holdThenLift(0);
    const held = holdThenLift(GRACE + HALF_LIFE * 3);

    expect(held.launchVelocity).toBeLessThan(immediate.launchVelocity / 4);
    expect(held.uiReleaseVelocity).toBeLessThan(
      immediate.uiReleaseVelocity / 4,
    );
    expect(held.pointerReleaseVelocity).toBeLessThan(
      immediate.pointerReleaseVelocity / 4,
    );
  });

  it("is the reason a long hold stops committing a flick", () => {
    // The consequence a user meets, as a pair: the SAME 20px pull — too short
    // to commit on distance — turns the page when it is flicked, and does not
    // when the finger holds it first. Nothing differs but the hold.
    const shortPull = (holdMs: number) => {
      mount();
      fire(pointer("pointerdown", { x: 100, t: 0 }));
      fire(pointer("pointermove", { x: 120, t: 16 }));
      fire(pointer("pointerup", { x: 120, t: 16 + holdMs }));
      return lastRelease().direction;
    };

    expect(shortPull(0)).toBe("right");
    expect(shortPull(GRACE + HALF_LIFE * 6)).toBe("none");
  });
});

describe("the pause is an INTERVAL, not a sum of two clocks", () => {
  const swipeAt = (epoch: number, holdMs: number) => {
    mount();
    fire(pointer("pointerdown", { x: 100, t: epoch }));
    fire(pointer("pointermove", { x: 160, t: epoch + 16 }));
    fire(pointer("pointermove", { x: 220, t: epoch + 32 }));
    fire(pointer("pointerup", { x: 220, t: epoch + 32 + holdMs }));
    return lastRelease();
  };

  it("decays by how long the finger held, not by what time it is", () => {
    // Every test above starts the gesture at t = 0, where "now minus the last
    // sample" and "now plus it" are nearly the same number. On a page that has
    // been open a while they are not: at t = 30000 a sum reads as a half-hour
    // hold, and every flick dies the moment the user has been on the page for
    // a minute. Same gesture, same hold, two epochs — the answers must match.
    // Neither epoch may be 0: React substitutes `Date.now()` for a zero
    // `timeStamp`, which would put the press on a different clock from its
    // own moves and make the two gestures incomparable for the wrong reason.
    const early = swipeAt(1000, GRACE - 1);
    const late = swipeAt(30000, GRACE - 1);

    expect(late.launchVelocity).toBeCloseTo(early.launchVelocity, 10);
    expect(late.pointerReleaseVelocity).toBeCloseTo(
      early.pointerReleaseVelocity,
      10,
    );
    expect(late.uiReleaseVelocity).toBeCloseTo(early.uiReleaseVelocity, 10);
    // And they are still live numbers, so the comparison is between two flicks
    // rather than between two zeroes — a sum decays everything to nothing at
    // either epoch, and two nothings agree perfectly.
    expect(Math.abs(late.launchVelocity)).toBeGreaterThan(0.5);
    expect(Math.abs(late.pointerReleaseVelocity)).toBeGreaterThan(0.5);
    expect(late.direction).toBe("right");
  });

  it("costs an instant lift nothing, however late in the session", () => {
    // The per-frame velocities decay by the EMA law rather than the pause law,
    // so any hold at all leaves them near zero and two near-zeroes agree
    // whatever the arithmetic. The case that separates them is the lift with
    // NO hold: the honest interval is zero and nothing decays, while a sum
    // reads two epochs of standstill and wipes the reading the deck settles by.
    const early = swipeAt(1000, 0);
    const late = swipeAt(30000, 0);

    expect(late.uiReleaseVelocity).toBeCloseTo(early.uiReleaseVelocity, 10);
    expect(Math.abs(late.uiReleaseVelocity)).toBeGreaterThan(0.1);
    expect(late.pointerReleaseVelocity).toBeCloseTo(
      early.pointerReleaseVelocity,
      10,
    );
  });
});

describe("the twitch at lift-off — the mirror risk", () => {
  it("cannot wipe a real flick", () => {
    // The terminal sample is judged over the last frames alone, so a
    // one-pixel correction as the finger leaves reads as a standstill. The
    // memory is captured BEFORE that sample precisely so it survives.
    mount();
    swipeFast();
    fire(pointer("pointerup", { x: 221, t: 48 }));
    const twitched = lastRelease();

    mount();
    swipeFast();
    fire(pointer("pointerup", { x: 220, t: 48 }));
    const clean = lastRelease();

    expect(twitched.launchVelocity).toBeCloseTo(clean.launchVelocity, 6);
    expect(twitched.pointerReleaseVelocity).toBeGreaterThan(0.5);
  });
});

describe("what the end reason decides", () => {
  it("a release commits a direction", () => {
    mount();
    swipeFast();
    fire(pointer("pointerup", { x: 220, t: 48 }));

    expect(lastRelease().endReason).toBe("release");
    expect(lastRelease().direction).toBe("right");
  });

  it("a cancel commits nothing, however far the finger travelled", () => {
    // The browser took the pointer away (a system gesture, a context menu).
    // The deck must go back, not commit a page the user never finished
    // asking for — but the velocity is still reported, because whoever
    // settles the deck needs it.
    mount();
    swipeFast();
    fire(pointer("pointercancel", { x: 220, t: 48 }));

    expect(lastRelease().endReason).toBe("external-cancel");
    expect(lastRelease().direction).toBe("none");
    expect(lastRelease().pointerReleaseVelocity).toBeGreaterThan(0);
  });

  it("a press with no travel still reports where it ended", () => {
    // With ownership taken (no catch window here), a lift is a release even
    // when the finger never moved: the consumer settles the deck and needs to
    // be told. It simply has no direction to commit.
    mount();
    fire(pointer("pointerdown", { x: 100, t: 0 }));
    fire(pointer("pointerup", { x: 100, t: 40 }));

    expect(releases).toHaveLength(1);
    expect(lastRelease().direction).toBe("none");
    expect(lastRelease().uiOffset).toBe(0);
  });
});

describe("the width the commit threshold is measured against", () => {
  /** A deliberately SLOW 40px pull: no flick intent, so only distance can
   *  commit it and the width is the only thing deciding. */
  const slowPull = () => {
    fire(pointer("pointerdown", { x: 100, t: 0 }));
    fire(pointer("pointermove", { x: 120, t: 200 }));
    fire(pointer("pointermove", { x: 140, t: 400 }));
    fire(pointer("pointerup", { x: 140, t: 600 }));
  };

  it("comes from the element the gesture started on", () => {
    // The threshold is a share of the deck's width: on a wide deck a 40px
    // pull is a nudge and must not turn the page.
    mount(1000);
    slowPull();
    expect(lastRelease().direction).toBe("none");
  });

  it("falls back to the minimum when there is no width to measure", () => {
    // Measured against a zero the share is zero, and every pull would commit.
    // The floor (`minSwipeDistance`) is what stands in for the missing width.
    mount(0);
    slowPull();
    expect(lastRelease().direction).toBe("right");
  });
});
