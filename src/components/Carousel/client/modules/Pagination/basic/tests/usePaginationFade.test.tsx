// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
const sweepStartedAt = (startedAt: number): Extract<PublishablePlan, { kind: "waapi" }> => ({
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

function Probe({ targetPageIndex }: { targetPageIndex: number }) {
  const { bindDotRef } = usePaginationFade({
    motionPlan: plan.source,
    visualPosition: visual.source,
    targetPageIndex,
    pageCount: PAGE_COUNT,
    isFinite: true,
  });
  return (
    <>
      {Array.from({ length: PAGE_COUNT }, (_, pageIndex) => (
        <div key={pageIndex} ref={bindDotRef(pageIndex)} data-page={pageIndex} />
      ))}
    </>
  );
}

const render = (targetPageIndex: number) =>
  act(() => {
    root.render(<Probe targetPageIndex={targetPageIndex} />);
  });

const dot = (pageIndex: number) =>
  host.querySelector<HTMLElement>(`[data-page="${pageIndex}"]`)!;

const paintedOpacity = (pageIndex: number) => Number(dot(pageIndex).style.opacity);
const animationOf = (pageIndex: number) =>
  recorded.find((entry) => entry.element === dot(pageIndex));

/**
 * Walks a fallback ride and asserts the painted strip against the rule itself
 * rather than against a frame count — a dropped frame must leave the paint
 * untouched, a kept one must land on its offset, at ANY tuning of the rule.
 */
const expectTheSharedDropRule = () => {
  let painted = paintedOpacity(1);
  for (let index = 0; index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1; index += 1) {
    const offset = 0.1 * (index + 1);
    const frame = frameAt(offset, { phase: "running", runningFrameIndex: index });
    visual.emit(frame);

    if (isDroppedFallbackFrame(frame)) {
      expect(paintedOpacity(1)).toBeCloseTo(painted, 10);
    } else {
      expect(paintedOpacity(1)).toBeCloseTo(opacityAt(strengthOf(1, offset)), 6);
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
