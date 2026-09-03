// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { motionNow } from "../../../../../../../shared";
import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../../../config";
import type {
  CarouselMotionPlan,
  MotionPlanChannel,
  MotionPlanSource,
} from "../../../../motion";
import {
  isDroppedFallbackFrame,
  type VisualPositionFrame,
  type VisualPositionSource,
} from "../../../../visual-position";
import { usePaginationFade } from "../usePaginationFade";
import { watchStyleWrites } from "../../tests/styleWrites";

/**
 * The binding's whole job is that ONE offset owns the strip across every mode.
 * The failures this guards are all the same shape — a mode change that
 * re-anchors the strip on the logical target instead of continuing from where
 * it actually is:
 *
 *  - a finger landing mid-ride must not `settle()`, or the dots snap onto the
 *    oncoming page while the deck itself sits on a fractional position;
 *  - the drag must then keep painting, and the release sweep must start from
 *    the offset the finger left, not from a snapped integer;
 *  - the no-WAAPI fallback (one long `follow` plan) must not park the dots on
 *    the destination for the whole ride.
 *
 * Ownership is the other half: while the binding paints, it owns each dot's
 * inline layer AND suppresses its CSS transition; at rest it must hand both
 * back, or the resting look and `:hover` stay frozen for good.
 */

const PAGE_COUNT = 4;

/** The channel's own input type — a plain `Omit` would collapse the plan union. */
type PublishablePlan = Parameters<MotionPlanChannel["publish"]>[0];

// jsdom resolves no custom properties, so the binding reads its documented
// fallback look: opacity 0.2 -> 0.8, scale 1 -> 1.5.
const opacityAt = (strength: number) => 0.2 + 0.6 * strength;
const strengthOf = (pageIndex: number, offset: number) =>
  Math.max(0, 1 - Math.abs(pageIndex - offset));

// ---- doubles ---------------------------------------------------------------

interface RecordedAnimation {
  element: Element;
  keyframes: Array<{ opacity: number; transform: string }>;
  isCancelled: boolean;
  finish: () => void;
}

let recorded: RecordedAnimation[] = [];
let originalAnimate: Element["animate"] | undefined;

const createPlanChannel = () => {
  const listeners = new Set<(plan: CarouselMotionPlan) => void>();
  let current: CarouselMotionPlan = { kind: "idle", planId: 0 };
  let nextId = 1;
  const source: MotionPlanSource = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    publish(plan: PublishablePlan) {
      current = { ...plan, planId: nextId };
      nextId += 1;
      const published = current;
      act(() => {
        listeners.forEach((listener) => listener(published));
      });
    },
  };
};

const frameAt = (
  pageOffset: number,
  extra: Partial<VisualPositionFrame> = {},
): VisualPositionFrame => ({
  position: pageOffset,
  pageOffset,
  velocity: 0,
  target: pageOffset,
  targetPageOffset: pageOffset,
  strategy: "gesture",
  timestamp: 0,
  phase: "idle",
  progress: 0,
  runningFrameIndex: 0,
  ...extra,
});

const createVisualPosition = () => {
  const listeners = new Set<(frame: VisualPositionFrame) => void>();
  let last = frameAt(0);
  const source: VisualPositionSource = {
    getSnapshot: () => last,
    sampleNow: () => last.position,
    wake: () => {},
    subscribe: (listener, options) => {
      listeners.add(listener);
      if (options?.emitCurrent ?? true) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    listenerCount: () => listeners.size,
    emit(frame: VisualPositionFrame) {
      last = frame;
      act(() => {
        listeners.forEach((listener) => listener(frame));
      });
    },
  };
};

/**
 * A step towards page 1. The stops carry a deliberate PLATEAU across the middle
 * third of the duration, so a sample taken anywhere in that third reads exactly
 * 0.5 — mid-flight assertions stay independent of how long the test itself
 * takes, without anyone having to fake the motion clock.
 */
const sweepStartedAt = (
  startedAt: number,
): Extract<PublishablePlan, { kind: "waapi" }> => ({
  kind: "waapi",
  direction: 1,
  duration: 100_000,
  stops: [0, 0.5, 0.5, 1],
  startedAt,
  targetKey: 1,
  isContinuation: false,
  isJump: false,
});

/** A ride caught halfway — the plateau makes the catch point exactly 0.5. */
const midFlightSweep = () => sweepStartedAt(motionNow() - 50_000);
const releaseSweep = () => sweepStartedAt(motionNow());

// ---- harness ---------------------------------------------------------------

let host: HTMLDivElement;
let root: Root;
let isUnmounted = false;
let plan: ReturnType<typeof createPlanChannel>;
let visual: ReturnType<typeof createVisualPosition>;

const unmount = () => {
  if (isUnmounted) return;
  isUnmounted = true;
  act(() => root.unmount());
};

interface ProbeProps {
  targetPageIndex: number;
  /** The host may render the dots later than it wires the binding up. */
  withDots?: boolean;
  /** The carousel nulls both streams together; a host may not. */
  withVisualPosition?: boolean;
}

function Probe({
  targetPageIndex,
  withDots = true,
  withVisualPosition = true,
}: ProbeProps) {
  const { bindDotRef } = usePaginationFade({
    motionPlan: plan.source,
    visualPosition: withVisualPosition ? visual.source : null,
    targetPageIndex,
    pageCount: PAGE_COUNT,
    isFinite: true,
  });
  if (!withDots) return null;
  return (
    <>
      {Array.from({ length: PAGE_COUNT }, (_, pageIndex) => (
        <div
          key={pageIndex}
          ref={bindDotRef(pageIndex)}
          data-page={pageIndex}
        />
      ))}
    </>
  );
}

const render = (
  targetPageIndex: number,
  props: Omit<ProbeProps, "targetPageIndex"> = {},
) =>
  act(() => {
    root.render(<Probe targetPageIndex={targetPageIndex} {...props} />);
  });

const dot = (pageIndex: number) =>
  host.querySelector<HTMLElement>(`[data-page="${pageIndex}"]`)!;

const paintedOpacity = (pageIndex: number) =>
  Number(dot(pageIndex).style.opacity);
const animationOf = (pageIndex: number) =>
  recorded.find((entry) => entry.element === dot(pageIndex));

/**
 * Walks a fallback ride and asserts the painted strip against the rule itself
 * rather than against a frame count — a dropped frame must leave the paint
 * untouched, a kept one must land on its offset, at ANY tuning of the rule.
 */
const expectTheSharedDropRule = () => {
  let painted = paintedOpacity(1);
  for (
    let index = 0;
    index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1;
    index += 1
  ) {
    const offset = 0.1 * (index + 1);
    const frame = frameAt(offset, {
      phase: "running",
      runningFrameIndex: index,
    });
    visual.emit(frame);

    if (isDroppedFallbackFrame(frame)) {
      expect(paintedOpacity(1)).toBeCloseTo(painted, 10);
    } else {
      expect(paintedOpacity(1)).toBeCloseTo(
        opacityAt(strengthOf(1, offset)),
        6,
      );
    }
    painted = paintedOpacity(1);
  }
};

/** Drives the strip to a known fractional offset with the finger down. */
const grabMidRideAndDragTo = (offset: number) => {
  render(0);
  render(1);
  plan.publish(midFlightSweep()); // a ride towards page 1
  plan.publish({ kind: "follow", isFallback: false }); // finger lands at ~0.5
  visual.emit(frameAt(offset - 0.5)); // base was 0 at offset 0.5
};

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to be re-attached in afterAll; jsdom has no Element.animate, so vi.spyOn cannot stand in
  originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes) {
    const entry: RecordedAnimation = {
      element: this,
      keyframes: keyframes as unknown as RecordedAnimation["keyframes"],
      isCancelled: false,
      finish: () => {},
    };
    const animation = {
      startTime: null as number | null,
      onfinish: null as (() => void) | null,
      cancel() {
        entry.isCancelled = true;
      },
    };
    entry.finish = () => animation.onfinish?.();
    recorded.push(entry);
    return animation as unknown as Animation;
  };
});

afterAll(() => {
  if (originalAnimate) Element.prototype.animate = originalAnimate;
  else Reflect.deleteProperty(Element.prototype, "animate");
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  plan = createPlanChannel();
  visual = createVisualPosition();
  recorded = [];
  isUnmounted = false;
});

afterEach(() => {
  unmount();
  host.remove();
});

describe("usePaginationFade — a finger landing mid-ride", () => {
  it("keeps the position the strip had reached instead of snapping to the target", () => {
    render(0);
    render(1);
    plan.publish(midFlightSweep());
    plan.publish({ kind: "follow", isFallback: false });

    // Halfway between page 0 and page 1 — the deck freezes there, so must the dots.
    expect(paintedOpacity(0)).toBeCloseTo(opacityAt(0.5), 6);
    expect(paintedOpacity(1)).toBeCloseTo(opacityAt(0.5), 6);
    // The failure mode: page 1 arriving at its full active look at once.
    expect(paintedOpacity(1)).not.toBeCloseTo(opacityAt(1), 2);
  });

  it("takes the compositor animations down as it takes over", () => {
    render(0);
    render(1);
    plan.publish(midFlightSweep());
    expect(recorded.length).toBeGreaterThan(0);

    plan.publish({ kind: "follow", isFallback: false });
    expect(recorded.every((entry) => entry.isCancelled)).toBe(true);
  });

  it("claims every dot, so the class flip cannot paint through the drag", () => {
    render(0);
    render(1);
    plan.publish(midFlightSweep());
    plan.publish({ kind: "follow", isFallback: false });

    for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex += 1) {
      expect(dot(pageIndex).style.opacity).not.toBe("");
      expect(dot(pageIndex).style.transition).toBe("none");
    }
  });
});

describe("usePaginationFade — following the finger", () => {
  it("moves the strip with every frame, in both directions", () => {
    grabMidRideAndDragTo(0.75);
    expect(paintedOpacity(0)).toBeCloseTo(opacityAt(strengthOf(0, 0.75)), 6);
    expect(paintedOpacity(1)).toBeCloseTo(opacityAt(strengthOf(1, 0.75)), 6);

    visual.emit(frameAt(-0.25)); // dragged back past the grab point
    expect(paintedOpacity(0)).toBeCloseTo(opacityAt(strengthOf(0, 0.25)), 6);
    expect(paintedOpacity(1)).toBeCloseTo(opacityAt(strengthOf(1, 0.25)), 6);
  });

  it("follows the deck by DELTA, not by its absolute position", () => {
    // The grab happened at 0.5 while the stream reads 0; a strip that mirrored
    // the stream would jump back to the start of the deck.
    render(0);
    render(1);
    plan.publish(midFlightSweep());
    plan.publish({ kind: "follow", isFallback: false });
    expect(paintedOpacity(1)).toBeCloseTo(opacityAt(0.5), 6);
  });

  /** The shared frame-drop rule, stated as the contract rather than as a count:
   * a fallback follow paints exactly the frames `isDroppedFallbackFrame` keeps,
   * so track, widget and dots cannot desync at any tuning of the rule. */
  it("drops exactly the frames the track and the widget drop", () => {
    render(0);
    plan.publish({ kind: "follow", isFallback: true });
    expectTheSharedDropRule();
  });

  /** On a no-WAAPI device a drag releases into a fallback ride: the plan flips
   * flavour but the subscription does not restart, so the drop rule has to flip
   * with it — otherwise the strip keeps painting frames the track skips. */
  it("switches to the dropping rule when a drag releases into the fallback ride", () => {
    render(0);
    plan.publish({ kind: "follow", isFallback: false }); // finger down
    plan.publish({ kind: "follow", isFallback: true }); // released, no compositor
    expectTheSharedDropRule();
  });
});

describe("usePaginationFade — the release", () => {
  it("starts the sweep where the finger left the dots", () => {
    grabMidRideAndDragTo(0.75);
    recorded = [];

    plan.publish(releaseSweep()); // END_DRAG -> page 1

    const incoming = animationOf(1);
    expect(incoming).toBeDefined();
    // The failure mode: a sweep starting from the settled integer target makes
    // this a zero-length step with no animation at all.
    expect(incoming!.keyframes[0]!.opacity).toBeCloseTo(
      opacityAt(strengthOf(1, 0.75)),
      3,
    );
    const frames = incoming!.keyframes;
    expect(frames[frames.length - 1]!.opacity).toBeCloseTo(opacityAt(1), 10);
  });

  it("hands the dots back when the sweep has nowhere to travel", () => {
    // A drag that returns to the page it started on: the release plan lands on
    // the offset the strip already holds.
    render(0);
    plan.publish({ kind: "follow", isFallback: false });
    expect(dot(0).style.opacity).not.toBe("");

    plan.publish(releaseSweep());

    for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex += 1) {
      expect(dot(pageIndex).style.opacity).toBe("");
      expect(dot(pageIndex).style.transition).toBe("");
    }
  });
});

describe("usePaginationFade — handing the strip back", () => {
  it("clears the inline layer and the transition suppression at rest", () => {
    grabMidRideAndDragTo(0.75);
    plan.publish({ kind: "idle" });

    for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex += 1) {
      expect(dot(pageIndex).style.opacity).toBe("");
      expect(dot(pageIndex).style.transform).toBe("");
      expect(dot(pageIndex).style.transition).toBe("");
    }
  });

  it("clears it on an instant snap too", () => {
    grabMidRideAndDragTo(0.75);
    plan.publish({ kind: "instant", direction: 1 });

    expect(dot(1).style.opacity).toBe("");
    expect(dot(1).style.transition).toBe("");
  });

  it("clears it when the destination dot's animation finishes", () => {
    render(0);
    render(1);
    plan.publish(releaseSweep());

    const incoming = animationOf(1);
    expect(incoming).toBeDefined();
    act(() => {
      incoming!.finish();
    });

    expect(dot(1).style.opacity).toBe("");
    expect(dot(1).style.transition).toBe("");
  });

  it("lets go of the position stream when the strip unmounts mid-drag", () => {
    grabMidRideAndDragTo(0.75);
    expect(visual.listenerCount()).toBe(1);

    unmount();
    expect(visual.listenerCount()).toBe(0);
  });
});

/**
 * The JUMP half of the plan, which nothing had ever published: 81 of this
 * file's mutants had no coverage, almost all of them here.
 *
 * A far GO_TO teleports the deck's middle, so there is no sweep for the dots
 * to ride — the strip would have to fly across pages it never shows. Instead
 * the dots CROSS-FADE straight from where they are to where they belong, still
 * on the plan's own clock, so the landing dot finishes with the picture rather
 * than before or after it.
 */
const jump = (
  overrides: Partial<Extract<PublishablePlan, { kind: "waapi" }>> = {},
): Extract<PublishablePlan, { kind: "waapi" }> => ({
  ...sweepStartedAt(motionNow()),
  isJump: true,
  ...overrides,
});

describe("usePaginationFade — a jump cross-fades instead of sweeping", () => {
  it("animates the dots whose look actually changes, and only those", () => {
    // Every other dot already wears the inactive look; animating it would be a
    // compositor layer per page, on every jump, for no visible change.
    render(0);
    render(3);
    plan.publish(jump());

    expect(animationOf(3)).toBeDefined();
    expect(animationOf(0)).toBeDefined();
    // A dot that is inactive before and after is left to its class.
    expect(animationOf(2)).toBeUndefined();
  });

  it("takes each dot from its own look to the one it should end on", () => {
    render(0);
    render(3);
    plan.publish(jump());

    const landing = animationOf(3)!;
    const leaving = animationOf(0)!;
    const first = <T,>(a: T[]) => a[0]!;
    const last = <T,>(a: T[]) => a[a.length - 1]!;

    // The landing dot ends brighter than it starts; the one being left, dimmer.
    expect(last(landing.keyframes).opacity).toBeGreaterThan(
      first(landing.keyframes).opacity,
    );
    expect(last(leaving.keyframes).opacity).toBeLessThan(
      first(leaving.keyframes).opacity,
    );
  });

  it("hands the dots back once the cross-fade finishes", () => {
    render(0);
    render(3);
    plan.publish(jump());

    // While the compositor owns a dot the hook pins its transition off, so the
    // CSS rule cannot animate the same property underneath. That flag — not
    // the opacity, which WAAPI writes and no stub can emulate — is what says
    // who is holding the dot.
    expect(dot(3).style.transition).toBe("none");
    expect(dot(0).style.transition).toBe("none");

    act(() => animationOf(3)!.finish());

    // Settled: the classes own the dots again, inline layer and all.
    expect(dot(3).style.transition).toBe("");
    expect(dot(0).style.transition).toBe("");
    expect(dot(3).style.opacity).toBe("");
  });

  it("settles without animating when there is nothing to cross-fade", () => {
    // Jumping to the page the strip is already on: every dot already wears the
    // look it should end on.
    render(2);
    plan.publish(jump());

    expect(recorded).toEqual([]);
    expect(dot(2).style.opacity).toBe("");
  });

  it("continues a jump from the previous cross-fade's own curve", () => {
    // Two GO_TOs in a row. The second must start from where the first fade had
    // got to ON ITS CURVE — reading the DOM instead would restart it from the
    // last painted frame, which the compositor may be ahead of.
    render(0);
    render(3);
    plan.publish(jump({ startedAt: motionNow() - 50_000 })); // mid cross-fade
    const firstLanding = animationOf(3)!;

    recorded = [];
    render(1);
    plan.publish(jump({ targetKey: 2 }));

    const secondLeaving = animationOf(3)!;
    // Dot 3 was on its way to being active and is now on its way back: its
    // fade starts from the MIDDLE of the first blend, not from either end.
    const start = secondLeaving.keyframes[0]!.opacity;
    const firstFrom = firstLanding.keyframes[0]!.opacity;
    const firstTo =
      firstLanding.keyframes[firstLanding.keyframes.length - 1]!.opacity;

    expect(start).toBeGreaterThan(Math.min(firstFrom, firstTo));
    expect(start).toBeLessThan(Math.max(firstFrom, firstTo));
  });

  it("clears the inline layer a finger left behind", () => {
    // A drag paints every dot inline, frame by frame. The cross-fade re-takes
    // only the dots it animates; the rest have to fall back to their classes,
    // or they stay frozen at whatever the last dragged frame wrote — a strip
    // that is half live and half stale.
    grabMidRideAndDragTo(0.5);
    expect(dot(2).style.opacity).not.toBe("");

    render(3);
    plan.publish(jump());

    expect(animationOf(2)).toBeUndefined();
    expect(dot(2).style.opacity).toBe("");
  });

  it("ignores a stale finish from a fade that was already replaced", () => {
    // A second jump cancels the first one's animations; the first one's
    // `onfinish` can still arrive and would settle the strip on the OLD page,
    // mid-way through the new fade.
    render(0);
    render(3);
    plan.publish(jump({ startedAt: motionNow() - 50_000 }));
    const stale = animationOf(3)!;

    render(1);
    plan.publish(jump({ targetKey: 2 }));
    expect(dot(1).style.transition).toBe("none"); // the new fade owns them

    act(() => stale.finish());

    expect(dot(1).style.transition).toBe("none"); // still owned, not settled
  });

  it("ignores a continuation slice — the jump already spans the command", () => {
    render(0);
    render(3);
    plan.publish(jump());
    const before = recorded.length;

    plan.publish(jump({ isContinuation: true, targetKey: 2 }));

    expect(recorded.length).toBe(before);
  });
});

/**
 * The follow-mode write gate — the same contract the widget carries, and just
 * as unreachable from any assertion about the DOM.
 *
 * Here the memory is per dot and keyed on ACTIVE STRENGTH rather than on the
 * painted values: one number decides both the opacity and the scale, so one
 * comparison is enough to know that neither moved. A strip of four dots is
 * cheap; a strip of twenty, repainted twice per dot on every frame of every
 * drag, is not.
 */
describe("usePaginationFade — what it refuses to write", () => {
  const everyDot = () => [...host.querySelectorAll<HTMLElement>("[data-page]")];

  let writes: ReturnType<typeof watchStyleWrites>;

  const followFrom = (offset: number) => {
    render(0);
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(offset));
    // Instrumented only now: the take-over deliberately claims EVERY dot, and
    // that first sweeping write is not what the gate is about.
    writes = watchStyleWrites(everyDot());
  };

  it("writes nothing at all for a frame that repeats the last one", () => {
    followFrom(0.5);

    visual.emit(frameAt(0.5));

    expect(writes.count()).toBe(0);
  });

  it("writes nothing for a move too small to see", () => {
    // Below `FOLLOW_STRENGTH_EPSILON`: the dot's look is a function of its
    // strength, so a strength that has not moved is a look that has not moved.
    followFrom(0.5);

    visual.emit(frameAt(0.5 + 1e-6));

    expect(writes.count()).toBe(0);
  });

  it("writes when the strip actually moves", () => {
    // The positive control: the silence above is the gate, not the harness
    // failing to reach the dots.
    followFrom(0.5);

    visual.emit(frameAt(0.9));

    expect(writes.count()).toBeGreaterThan(0);
  });

  it("leaves alone the dots the offset never comes near", () => {
    // Strength is zero for anything more than a page away and stays zero as
    // the strip slides between two neighbours. Those dots are not merely
    // written with the same value — they are not written.
    followFrom(0);

    visual.emit(frameAt(0.5));

    expect(writes.count()).toBeGreaterThan(0);
    expect(writes.written()).not.toContain(dot(2));
  });
});

/**
 * The three defensive branches nothing had ever executed: a plan that lands
 * before the host has rendered a dot, an engine that refuses keyframes, and a
 * follow plan with no position stream behind it.
 *
 * None of them is exotic — they are what the module does on the way in, on the
 * way out, and on a browser that says no. All three are silent when wrong: the
 * dots simply stop agreeing with the deck, and nothing throws.
 */
describe("usePaginationFade — the branches that run when something is missing", () => {
  it("still takes a running motion down when the dots have gone", () => {
    // Between two renders the host may hand back an empty strip. There is
    // nothing left to paint, but the motion already on the compositor is not
    // nothing: left alone it keeps running against dots that will come back.
    render(0);
    render(1);
    plan.publish(midFlightSweep());
    const running = recorded.filter((entry) => !entry.isCancelled);
    expect(running.length).toBeGreaterThan(0);

    render(1, { withDots: false });
    plan.publish(releaseSweep());

    expect(running.every((entry) => entry.isCancelled)).toBe(true);
  });

  // Both motions build their own keyframes and both must survive the refusal;
  // covering one proves nothing about the other.
  const withRefusedKeyframes = (publish: () => void) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to be put back verbatim, never called; the same exception the stub install above carries
    const real = Element.prototype.animate;
    Element.prototype.animate = () => {
      throw new Error("keyframes not supported");
    };
    try {
      publish();
    } finally {
      Element.prototype.animate = real;
    }
  };

  it.each([
    ["a sweep", () => plan.publish(releaseSweep())],
    ["a jump", () => plan.publish(jump())],
  ])(
    "hands a dot back to its classes when the engine refuses %s's keyframes",
    (_name, publish) => {
      // `startPinnedAnimation` answers `null` rather than throwing when the
      // engine will not take the keyframes. The dot must then be RELEASED, not
      // left owned: an owned dot keeps `transition: none` and the inline look
      // it was mid-write on, so it freezes for the rest of the page's life.
      render(0);
      render(1);

      withRefusedKeyframes(publish);

      for (const pageIndex of [0, 1]) {
        expect(dot(pageIndex).style.transition).toBe("");
        expect(dot(pageIndex).style.opacity).toBe("");
        expect(dot(pageIndex).style.transform).toBe("");
      }
    },
  );

  it("settles instead of following when there is no position stream", () => {
    // The carousel nulls both streams together, so this is reachable only from
    // a host that splits them. Following nothing would park the dots wherever
    // the last motion left them, for good.
    // Mounted without the stream from the start, on purpose: switching it off
    // mid-life re-runs the subscription effect, and its teardown releases every
    // dot on its own. A test that renamed the prop would be watching the
    // teardown and calling it the guard.
    const withoutStream = { withVisualPosition: false } as const;
    render(0, withoutStream);
    render(1, withoutStream);
    plan.publish(midFlightSweep()); // dots owned, mid cross-fade
    expect(dot(1).style.transition).toBe("none");

    plan.publish({ kind: "follow", isFallback: false });

    expect(dot(1).style.transition).toBe("");
    expect(dot(1).style.opacity).toBe("");
  });
});

/**
 * Three rules that decide how much work a motion costs, none of which changes
 * what the strip finally looks like — so none of them is reachable by an
 * assertion about the painted dots alone.
 */
describe("usePaginationFade — the work it declines to do", () => {
  it("animates only the dots the sweep actually lights up", () => {
    // A dot the offset never comes near keeps its class look for the whole
    // ride: animating it is a compositor layer per page, every step, for a
    // change nobody can see. The destination dot is the exception — it is
    // animated even when its look barely moves, because the settle hangs off
    // its finish.
    render(0);
    render(1);

    plan.publish(releaseSweep());

    expect(animationOf(1)).toBeDefined(); // the destination
    expect(animationOf(0)).toBeDefined(); // it fades out as the strip leaves
    expect(animationOf(3)).toBeUndefined(); // two pages away the whole way
    for (const entry of recorded) {
      const looks = entry.keyframes.map((frame) => String(frame.opacity));
      expect(new Set(looks).size).toBeGreaterThan(1);
    }
  });

  it.each([0, 1, 2, 3])(
    "always animates the destination, whichever page %i it is",
    (destination) => {
      // The settle hangs off the destination's own finish, so an unanimated
      // destination is a strip that never gets handed back to its classes.
      // Pinned across every page because the skip rule above is what could
      // take it away, and the rule is a scan over a sampled curve.
      render((destination + 2) % PAGE_COUNT);
      render(destination);

      plan.publish(releaseSweep());

      expect(animationOf(destination)).toBeDefined();
    },
  );

  it("hangs the settle on the DESTINATION's animation, not the first one built", () => {
    // The blends are built in page order, so the destination is rarely last —
    // and whichever animation happens to be built first would settle the strip
    // early, handing the dots back to their classes mid-cross-fade.
    render(3);
    render(0); // destination 0, but dot 3 is blended too and finishes alongside

    plan.publish(jump());

    const destination = animationOf(0);
    const other = animationOf(3);
    expect(destination).toBeDefined();
    expect(other).toBeDefined();

    act(() => other!.finish());
    expect(dot(0).style.transition).toBe("none"); // still owned: not settled

    act(() => destination!.finish());
    expect(dot(0).style.transition).toBe(""); // handed back
  });

  it("reads the CSS look once, not on every take-over", () => {
    // `readDotStates` runs `getComputedStyle`, which forces a style recalc.
    // The look only changes at rest (theme, breakpoint), and `settle` re-reads
    // it there — so a grab must ride the cached answer.
    render(0);
    render(1);
    const computed = vi.spyOn(window, "getComputedStyle");

    plan.publish({ kind: "follow", isFallback: false });
    const afterFirst = computed.mock.calls.length;

    plan.publish(midFlightSweep()); // stops following, no settle
    plan.publish({ kind: "follow", isFallback: false });

    expect(computed.mock.calls.length).toBe(afterFirst);
    computed.mockRestore();
  });
});
