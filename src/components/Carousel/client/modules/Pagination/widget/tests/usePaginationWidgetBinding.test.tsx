// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";

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
import { buildPaginationWidgetGeometry } from "../math/spatialField";
import { PAGINATION_WIDGET_DEFAULTS } from "../defaults";
import { usePaginationWidgetBinding } from "../usePaginationWidgetBinding";
import { watchStyleWrites } from "../../tests/styleWrites";

/**
 * Follow mode's pacing contract. The runner publishes `follow` twice on a
 * no-WAAPI device — once for the finger, once for the ride it releases into —
 * and the second plan does NOT restart the subscription. A binding that read
 * its flavour from the first plan's closure would keep painting every frame
 * while the track skips every Nth, which is exactly the desync the shared rule
 * exists to prevent.
 */

type PublishablePlan = Parameters<MotionPlanChannel["publish"]>[0];

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
    emit(frame: VisualPositionFrame) {
      last = frame;
      act(() => {
        listeners.forEach((listener) => listener(frame));
      });
    },
  };
};

let host: HTMLDivElement;
let root: Root;
let plan: ReturnType<typeof createPlanChannel>;
let visual: ReturnType<typeof createVisualPosition>;

function Probe({ activeClassName }: { activeClassName?: string }) {
  const geometry = useMemo(
    () =>
      buildPaginationWidgetGeometry(PAGINATION_WIDGET_DEFAULTS.visibleDots, {
        size: PAGINATION_WIDGET_DEFAULTS.dotSize,
        gap: PAGINATION_WIDGET_DEFAULTS.dotGap,
        scaleFactor: PAGINATION_WIDGET_DEFAULTS.scaleFactor,
      }),
    [],
  );
  const { bindDotRef, bindActiveDotRef, slotCount, activeDotCount } =
    usePaginationWidgetBinding({
      visualPosition: visual.source,
      motionPlan: plan.source,
      geometry,
      activeClassName,
    });
  return (
    <>
      {Array.from({ length: slotCount }, (_, index) => (
        <div key={index} ref={bindDotRef(index)} data-slot={index} />
      ))}
      {/* The active overlays carry the PAGE identity: the dot strip repeats
          every page, so an absolute landing is only visible here. */}
      {Array.from({ length: activeDotCount }, (_, index) => (
        <div
          key={`a${index}`}
          ref={bindActiveDotRef(index)}
          data-active={index}
        />
      ))}
    </>
  );
}

/** The whole strip's painted state — a frame either moves it or it does not. */
const paintedStrip = () =>
  [...host.querySelectorAll<HTMLElement>("[data-slot]")]
    .map((dot) => `${dot.style.transform}@${dot.style.opacity}`)
    .join("|");

const renderProbe = (props: { activeClassName?: string } = {}) => {
  act(() => {
    root.render(<Probe {...props} />);
  });
};

const mountProbe = () => {
  root = createRoot(host);
  plan = createPlanChannel();
  visual = createVisualPosition();
  renderProbe();
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  mountProbe();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/**
 * Walks a fallback ride and asserts the strip against the rule itself rather
 * than against a frame count: a dropped frame must leave the paint untouched, a
 * kept one must move it — at ANY tuning of the rule.
 */
const expectTheSharedDropRule = () => {
  let painted = paintedStrip();
  for (
    let index = 0;
    index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1;
    index += 1
  ) {
    const frame = frameAt(0.1 * (index + 1), {
      phase: "running",
      runningFrameIndex: index,
    });
    visual.emit(frame);

    if (isDroppedFallbackFrame(frame)) expect(paintedStrip()).toBe(painted);
    else expect(paintedStrip()).not.toBe(painted);
    painted = paintedStrip();
  }
};

describe("usePaginationWidgetBinding — follow pacing", () => {
  it("drops exactly the frames the track drops on a fallback ride", () => {
    plan.publish({ kind: "follow", isFallback: true });
    expectTheSharedDropRule();
  });

  it("switches to the dropping rule when a drag releases into the fallback ride", () => {
    plan.publish({ kind: "follow", isFallback: false }); // finger down
    plan.publish({ kind: "follow", isFallback: true }); // released, no compositor
    expectTheSharedDropRule();
  });

  it("paints every frame while the finger is down", () => {
    plan.publish({ kind: "follow", isFallback: false });

    let painted = paintedStrip();
    for (
      let index = 0;
      index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1;
      index += 1
    ) {
      visual.emit(
        frameAt(0.1 * (index + 1), {
          phase: "running",
          runningFrameIndex: index,
        }),
      );
      expect(paintedStrip()).not.toBe(painted);
      painted = paintedStrip();
    }
  });
});

/**
 * The STEP half of the binding, which nothing had ever executed: 115 of this
 * file's mutants had no coverage at all, and the tests above only ever publish
 * `follow` plans.
 *
 * A step is where the widget hands its dots to the compositor and stops
 * painting them by hand, so it is also where the widget can silently stop
 * agreeing with the deck: the strip lands on a different page than the track,
 * or freezes half-way, and nothing throws. jsdom ships no Web Animations API,
 * so the stub below is the external boundary — the same one `trackBinding`
 * stubs for the same reason.
 */

interface AnimationStub {
  cancel: () => void;
  cancelled: boolean;
  keyframes: Keyframe[];
  target: Element;
  onfinish: (() => void) | null;
}

let animations: AnimationStub[] = [];

Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  writable: true,
  value: function (this: Element, keyframes: Keyframe[]) {
    const stub: AnimationStub = {
      cancelled: false,
      keyframes,
      target: this,
      onfinish: null,
      cancel() {
        stub.cancelled = true;
      },
    };
    animations.push(stub);
    return stub as unknown as Animation;
  },
});

const waapiPlan = (overrides: Record<string, unknown> = {}) => ({
  kind: "waapi" as const,
  direction: 1 as const,
  duration: 300,
  stops: [0, 0.5, 1],
  startedAt: 0,
  targetKey: 1,
  isContinuation: false,
  isJump: false,
  ...overrides,
});

describe("usePaginationWidgetBinding — the step the compositor runs", () => {
  beforeEach(() => {
    animations = [];
  });

  it("hands every visible dot to the compositor, and pins the invisible ones", () => {
    // A dot that is invisible for the whole step is parked at its final frame
    // instead of being animated: an animation per off-strip dot is work the
    // compositor does for nobody, on every single step.
    plan.publish(waapiPlan());

    expect(animations.length).toBeGreaterThan(0);
    const painted = [...host.querySelectorAll<HTMLElement>("[data-slot]")];
    const animated = new Set(animations.map((a) => a.target));
    const pinned = painted.filter((dot) => !animated.has(dot));

    expect(pinned.length).toBeGreaterThan(0);
    // Pinned means painted, not left blank.
    for (const dot of pinned) expect(dot.style.transform).not.toBe("");
  });

  it("animates only the active dots the step passes through", () => {
    // The overlays mark the current page while the strip slides under them.
    // One is handed to the compositor for the pages the step crosses; the rest
    // are parked at zero rather than left showing a page nobody is on.
    plan.publish(waapiPlan());

    const overlays = [...host.querySelectorAll<HTMLElement>("[data-active]")];
    const animated = new Set(animations.map((a) => a.target));

    expect(overlays.some((overlay) => animated.has(overlay))).toBe(true);
    for (const overlay of overlays) {
      if (!animated.has(overlay)) expect(overlay.style.opacity).toBe("0");
    }
  });

  it("lands the strip on the step's target when the animation finishes", () => {
    // The compositor owns the styles for the length of the step; on finish the
    // binding takes them back and repaints from the target. Miss this and the
    // strip keeps whatever the last compositor frame left — close to the page,
    // never on it.
    // Start mid-page: the strip is PERIODIC with a period of one page, so a
    // whole-page move maps every dot onto its neighbour's slot and paints an
    // identical set of transforms. Only a change of phase is visible.
    // The position subscription only exists while a `follow` plan is live, so
    // the finger has to put the strip mid-page before the step takes over.
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(0.4));
    plan.publish(waapiPlan());
    const before = paintedStrip();

    act(() => animations[0]!.onfinish?.());

    expect(paintedStrip()).not.toBe(before);
    // And the strip is hand-paintable again — but only once the runner asks
    // for it: a step STOPS following, so frames alone reach nothing until the
    // next `follow` plan puts the subscription back.
    // And the strip is paintable by hand again — but only once the runner asks
    // for it: a step STOPS following, so frames alone reach nothing until the
    // next `follow` plan puts the subscription back. Following is DELTA-based,
    // so the frame that re-establishes it moves nothing; the one after it does.
    const landed = paintedStrip();
    visual.emit(frameAt(2.9));
    expect(paintedStrip()).toBe(landed);

    plan.publish({ kind: "follow", isFallback: false });
    expect(paintedStrip()).toBe(landed);

    visual.emit(frameAt(3.4));
    expect(paintedStrip()).not.toBe(landed);
  });

  it("ignores the finish of a step that was already replaced", () => {
    // A second step can start before the first one's `onfinish` arrives.
    // Acting on the stale one drags the strip back to the old destination.
    plan.publish(waapiPlan({ targetKey: 1 }));
    const first = animations[0]!;

    animations = [];
    plan.publish(waapiPlan({ targetKey: 2, direction: 1 }));
    const painted = paintedStrip();

    act(() => first.onfinish?.());

    expect(paintedStrip()).toBe(painted);
  });

  it("cancels the running step's animations when a new one starts", () => {
    // Two compositor animations on one dot fight over its transform.
    plan.publish(waapiPlan({ targetKey: 1 }));
    const firstRound = [...animations];
    expect(firstRound.some((a) => a.cancelled)).toBe(false);

    plan.publish(waapiPlan({ targetKey: 2 }));

    expect(firstRound.every((a) => a.cancelled)).toBe(true);
  });

  it("lets a continuation ride the step that is already running", () => {
    // A far GO_TO arrives as a teleport plus an approach slice. The approach
    // is a continuation: re-planning it would restart the strip's animation
    // half-way through the deck's.
    plan.publish(waapiPlan({ targetKey: 1 }));
    const first = [...animations];

    animations = [];
    plan.publish(waapiPlan({ targetKey: 1, isContinuation: true }));

    expect(animations).toEqual([]);
    expect(first.some((a) => a.cancelled)).toBe(false);
  });

  it("still starts a continuation that has no step to continue", () => {
    // The other half of the same guard: without a live step the continuation
    // IS the step, and skipping it would leave the strip behind for the whole
    // approach.
    plan.publish(waapiPlan({ isContinuation: true }));

    expect(animations.length).toBeGreaterThan(0);
  });
});

describe("usePaginationWidgetBinding — the steps that need no compositor", () => {
  beforeEach(() => {
    animations = [];
  });

  it("lands the strip without animating anything", () => {
    // Reduced motion: no curve, no animation, just the landing. The direction
    // is the whole payload — read it wrong and the widget walks away from the
    // deck one page at a time.
    // Reduced motion: no curve, no compositor, just the landing.
    //
    // The DIRECTION of that landing is deliberately not asserted, because this
    // hook cannot show it. Everything it writes is invariant under a whole-page
    // shift — the dot strip repeats every page, the active overlay sits in the
    // centre, and even the next step's keyframes are sampled relative to a
    // window that shifts with the offset. Which page the widget thinks it is on
    // only becomes visible against the DECK, which is an integration question,
    // not one this binding can answer.
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(0.4));
    const midPage = paintedStrip();

    plan.publish({ kind: "instant", direction: 1 });

    expect(animations).toEqual([]);
    expect(paintedStrip()).not.toBe(midPage);
  });

  it("settles a running step on the target when the plan goes idle", () => {
    // Idle means the deck arrived. The strip has to arrive with it rather than
    // stay wherever the cancelled animation left it.
    plan.publish(waapiPlan());
    const midStep = paintedStrip();

    plan.publish({ kind: "idle" });

    expect(paintedStrip()).not.toBe(midStep);
    expect(animations.every((a) => a.cancelled)).toBe(true);
  });

  it("does nothing on idle when there was no step to settle", () => {
    const before = paintedStrip();
    plan.publish({ kind: "idle" });
    expect(paintedStrip()).toBe(before);
  });
});

describe("usePaginationWidgetBinding — a finger taking the strip over", () => {
  beforeEach(() => {
    animations = [];
  });

  it("takes over from where the strip IS, and follows by delta from there", () => {
    // The deck's absolute page and the strip's live offset are not the same
    // number mid-step: the strip is wherever its curve has carried it. Reading
    // the first frame as an absolute position would snap the strip to the deck
    // the instant a finger lands on it — a visible jump under the thumb.
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(0.25));
    const grabbed = paintedStrip();

    // A second grab: the runner re-publishes `follow` with a page offset far
    // from where the strip sits. The first frame only re-bases.
    plan.publish({
      kind: "waapi",
      direction: 1,
      duration: 300,
      stops: [0, 1],
      startedAt: 0,
      targetKey: 9,
      isContinuation: false,
      isJump: false,
    });
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(40.25));
    const afterRebase = paintedStrip();

    // …and the NEXT frame moves it by exactly the delta, not to page 40.
    visual.emit(frameAt(40.75));
    const afterDelta = paintedStrip();

    expect(afterDelta).not.toBe(afterRebase);
    // Half a page of delta from the re-base, whatever the absolute page was.
    plan.publish({ kind: "follow", isFallback: false });
    expect(afterDelta).not.toBe(grabbed);
  });
});

/**
 * The per-frame write gate — the one contract in this file that NO assertion
 * about the DOM can reach.
 *
 * The binding caches what it last wrote per slot and skips the write when the
 * new value lands within an epsilon of it. Skipping produces a document byte
 * for byte identical to writing, so every test above stays green with the gate
 * removed entirely; the only observable is the number of times the setter ran.
 *
 * What is at stake is not correctness but the cost of a drag: `slotCount` dots
 * plus the overlays, twice per frame, at 60 frames a second, for values the
 * compositor would resolve to the same pixels.
 */
describe("usePaginationWidgetBinding — what it refuses to write", () => {
  const everyPaintedNode = () => [
    ...host.querySelectorAll<HTMLElement>("[data-slot], [data-active]"),
  ];

  let writes: ReturnType<typeof watchStyleWrites>;

  beforeEach(() => {
    animations = [];
    // The mount's own static paint happens before this, which is what we want:
    // the first paint has nothing to compare against and must always write.
    writes = watchStyleWrites(everyPaintedNode());
    plan.publish({ kind: "follow", isFallback: false });
    writes.reset();
  });

  it("writes nothing at all for a frame that repeats the last one", () => {
    // A finger held still, a ride paused against a bound, a stream that
    // re-emits: the strip has not moved, so nothing about it may be touched.
    visual.emit(frameAt(0));

    expect(writes.count()).toBe(0);
  });

  it("writes nothing for a move too small to see", () => {
    // Sub-pixel drift below the position epsilon. The gate exists exactly for
    // this: a frame that moves the strip by a thousandth of a pixel costs the
    // same as no frame at all.
    //
    // Nudged from MID-page on purpose: crossing a whole page is a different
    // event, and it has its own case below.
    visual.emit(frameAt(0.5));
    writes.reset();

    visual.emit(frameAt(0.5 + 1e-6));

    expect(writes.count()).toBe(0);
  });

  it("places the second overlay the moment the strip leaves a whole page", () => {
    // Exactly on a page the two overlays name the same dot, so the second is
    // parked. A hair past it they name different pages and the parked one has
    // to be MOVED to its own before it can be faded up — even though the move
    // itself is far below the epsilon that would otherwise silence it.
    //
    // Found by this suite: the sub-epsilon case above first ran from 0 and saw
    // exactly this one write.
    visual.emit(frameAt(1e-6));

    expect(writes.count("transform")).toBe(1);
    expect(writes.written()).toEqual([
      host.querySelector<HTMLElement>('[data-active="1"]'),
    ]);
  });

  it("writes when the strip actually moves", () => {
    // The other half of the same gate — proof the silence above is the gate
    // working and not the harness failing to reach the DOM.
    visual.emit(frameAt(0.5));

    expect(writes.count()).toBeGreaterThan(0);
  });

  it("gates the two properties apart", () => {
    // Transform and opacity have their own epsilons and their own cache
    // fields. A dot near the middle of the strip slides a visible distance
    // while its opacity barely stirs: collapsing the two gates into one would
    // repaint an opacity nobody can tell apart, on every frame of every drag.
    visual.emit(frameAt(0.02));

    expect(writes.count("transform")).toBeGreaterThan(0);
    expect(writes.count("opacity")).toBeLessThan(writes.count("transform"));
  });

  it("never touches a slot that is hidden and staying hidden", () => {
    // The strip carries coverage margin on both sides — slots that exist so a
    // step has somewhere to land, and paint nothing until it does. Their
    // POSITION still changes on every frame, so the epsilon gate alone would
    // happily rewrite the transform of a dot nobody can see; the early exit is
    // what makes an invisible slot cost nothing at all.
    const hidden = () =>
      new Set(everyPaintedNode().filter((node) => node.style.opacity === "0"));

    const before = hidden();
    visual.emit(frameAt(0.5));
    const after = hidden();
    const stayedHidden = [...before].filter((node) => after.has(node));

    expect(stayedHidden.length).toBeGreaterThan(0);
    expect(writes.count()).toBeGreaterThan(0); // the visible ones did move
    for (const node of stayedHidden) {
      expect(writes.written()).not.toContain(node);
    }
  });
});

/**
 * The active class on the resting slot — 23 of this file's mutants survived
 * here, and four of them had no coverage at all, because every test above
 * mounts the binding without an `activeClassName` and never renames one.
 *
 * The class is how the widget's CSS knows which dot is "the current page". It
 * is placed on the slot the strip rests under, not on a page index: the strip
 * slides beneath a fixed marker rather than the marker chasing the strip.
 */
describe("usePaginationWidgetBinding — the class marking the resting slot", () => {
  const slots = () => [...host.querySelectorAll<HTMLElement>("[data-slot]")];
  const carrying = (className: string) =>
    slots().filter((slot) => slot.classList.contains(className));

  it("marks the middle slot, and only that one", () => {
    // The strip is symmetric around its centre; the centre is where the deck's
    // current page sits at rest. Two marked dots — or a marked neighbour — is
    // the widget disagreeing with the deck about which page is current.
    renderProbe({ activeClassName: "is-active" });

    const marked = carrying("is-active");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(slots()[Math.floor(slots().length / 2)]);
  });

  it("carries no class at all when the host passes none", () => {
    // The static widget and the CSS-module-less host both land here, and a
    // stray class name is a style nobody wrote.
    renderProbe();

    for (const slot of slots()) expect(slot.className).toBe("");
  });

  it("takes the old name off every slot when the host renames it", () => {
    // CSS modules hand out a fresh hashed name whenever the stylesheet is
    // rebuilt, and the whole strip is written once and reused. Leaving the old
    // name behind marks a slot for good, and the marker never moves again.
    renderProbe({ activeClassName: "old-name" });
    expect(carrying("old-name")).toHaveLength(1);

    renderProbe({ activeClassName: "new-name" });

    expect(carrying("old-name")).toHaveLength(0);
    expect(carrying("new-name")).toHaveLength(1);
  });

  it("strips the class when the host stops passing one", () => {
    // Switching the module off must leave the strip as bare as it was before
    // it was ever switched on — the removal cannot be skipped just because
    // there is no new name to put in its place.
    renderProbe({ activeClassName: "is-active" });

    renderProbe();

    expect(carrying("is-active")).toHaveLength(0);
  });
});

describe("usePaginationWidgetBinding — when the compositor takes nothing", () => {
  beforeEach(() => {
    animations = [];
  });

  it("lands the strip on the target instead of leaving it mid-step", () => {
    // `startPinnedAnimation` answers `null` — not throws — when the engine
    // refuses the keyframes, and every dot may refuse at once. With no
    // animation to finish, nothing would ever call `finalizeStep`: the strip
    // would sit at the offset it had when the step began, one page behind the
    // deck, until the next plan happened to move it.
    //
    // Watched by WRITES rather than by the painted strip: a dot that is
    // invisible for the whole step is parked at its last frame BEFORE the
    // empty-animation check, so the strip's look changes either way. Only the
    // visible dots tell the two apart — they are painted by the landing and by
    // nothing else.
    plan.publish({ kind: "follow", isFallback: false });
    visual.emit(frameAt(0.4));
    const slots = [...host.querySelectorAll<HTMLElement>("[data-slot]")];
    const middle = slots[Math.floor(slots.length / 2)]!;
    expect(middle.style.opacity).not.toBe("0"); // it is one of the visible ones
    const writes = watchStyleWrites(slots);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to be put back verbatim, never called; the same exception the stub install above carries
    const real = Element.prototype.animate;
    Element.prototype.animate = () => {
      throw new Error("keyframes not supported");
    };
    try {
      plan.publish(waapiPlan());
    } finally {
      Element.prototype.animate = real;
    }

    expect(animations).toEqual([]);
    expect(writes.written()).toContain(middle);

    // And it LANDED rather than merely repainted: an idle plan finds no step
    // left to settle, so it changes nothing.
    const landed = paintedStrip();
    plan.publish({ kind: "idle" });
    expect(paintedStrip()).toBe(landed);
  });
});
