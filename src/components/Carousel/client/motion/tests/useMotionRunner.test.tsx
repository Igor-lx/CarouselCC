// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The reducer owns its context, so a state fixture carries the defaults. */
const initialStateFor = (layout: Parameters<typeof buildInitialState>[0]) =>
  buildInitialState(layout, buildCarouselConfig({}));

import type { TrackBindingApi } from "../../geometry";

import { buildCarouselConfig } from "../../config";
import type { CarouselRuntimeConfig } from "../../config";
import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import { motionNow } from "../../../../../shared";
import { buildInitialState } from "../../state/initial";
import type { CarouselState } from "../../state";
import type { Slide } from "../../public-api/types";
import { useMotionRunner } from "../useMotionRunner";
import { createMotionPlanChannel } from "../planChannel";
import type { CarouselMotionPlan } from "../planChannel";
import type { CarouselMotionStrategy } from "../types";
import {
  useMotionController,
  type MotionController,
} from "../../../../../shared";

/**
 * The only bridge from "the reducer decided" to "the deck moves".
 *
 * Its whole job is deciding WHEN to act, and every mistake there is silent:
 * a missed re-plan leaves the deck stranded at the old target, a duplicate one
 * restarts a ride from its own midpoint (a visible lurch), and a runner that
 * does not tear down on unmount leaves an animation writing to a detached node.
 *
 * The controller is real — it is the position SSOT and mocking it would test
 * nothing. The compositor is a spy, because that IS the external boundary.
 */

const config: CarouselRuntimeConfig = buildCarouselConfig({});

const layout = buildCarouselLayout(
  buildSlideRecords(
    Array.from({ length: 12 }, (_, i): Slide => ({
      id: `s${i}`,
      content: `c${i}`,
    })),
  ),
  3,
  false,
);

const stationary = initialStateFor(layout);

const moving = (overrides: Partial<CarouselState> = {}): CarouselState => ({
  ...stationary,
  fromVirtualIndex: 0,
  virtualIndex: 3,
  targetPageIndex: 1,
  motionPhase: "step-normal",
  moveReason: "click",
  ...overrides,
});

let host: HTMLDivElement;
let root: Root;
let plans: CarouselMotionPlan[];
let startCompositorMotion: Mock<TrackBindingApi["startCompositorMotion"]>;
let cancelCompositorMotion: Mock<TrackBindingApi["cancelCompositorMotion"]>;
let settles: number[];
let controller: MotionController<CarouselMotionStrategy> | null;

function Probe({
  state,
  isInstantMode = false,
}: {
  state: CarouselState;
  isInstantMode?: boolean;
}) {
  const ctrl = useMotionController<CarouselMotionStrategy>(0, "idle");
  controller = ctrl;
  useMotionRunner({
    state,
    config,
    controller: ctrl,
    isInstantMode,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan: channel.publish,
    onSettle: (position) => settles.push(position),
  });
  return null;
}

let channel: ReturnType<typeof createMotionPlanChannel>;

const render = (state: CarouselState) =>
  act(() => {
    root.render(<Probe state={state} />);
  });

const kinds = () => plans.map((p) => p.kind);
const lastPlan = () => plans.at(-1)!;

beforeEach(() => {
  plans = [];
  settles = [];
  controller = null;
  channel = createMotionPlanChannel();
  channel.source.subscribe((plan) => plans.push(plan));
  // The compositor takes every ride by default; the boundary, spied not faked.
  startCompositorMotion = vi.fn(() => true);
  cancelCompositorMotion = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("useMotionRunner — when it re-plans", () => {
  it("plans nothing but rest for a deck standing still", () => {
    render(stationary);
    expect(kinds()).toEqual([]); // idle-on-idle is deduped by the channel
    expect(startCompositorMotion).not.toHaveBeenCalled();
  });

  it("starts one ride when the reducer names a new target", () => {
    render(stationary);
    render(moving());
    expect(startCompositorMotion).toHaveBeenCalledTimes(1);
    expect(lastPlan().kind).toBe("waapi");
  });

  it("does NOT re-plan when the same state renders again", () => {
    render(stationary);
    render(moving());
    const rides = startCompositorMotion.mock.calls.length;

    render(moving());
    render(moving());
    // A second start here would restart the ride from its own midpoint.
    expect(startCompositorMotion).toHaveBeenCalledTimes(rides);
  });

  it("re-plans when the target actually moves", () => {
    render(stationary);
    render(moving());
    render(moving({ virtualIndex: 6, targetPageIndex: 2 }));
    expect(startCompositorMotion).toHaveBeenCalledTimes(2);
  });

  it("re-plans when only the repeated-click flag flips", () => {
    // Same origin and target, different profile: the runner must rebuild.
    render(stationary);
    render(moving());
    render(moving({ isRepeatedClickAdvance: true }));
    expect(startCompositorMotion).toHaveBeenCalledTimes(2);
  });

  it("holds still for a deck that cannot slide", () => {
    const tiny = buildCarouselLayout(
      buildSlideRecords([
        { id: "a", content: "a" },
        { id: "b", content: "b" },
      ]),
      3,
      false,
    );
    render({ ...initialStateFor(tiny), virtualIndex: 1 });
    expect(startCompositorMotion).not.toHaveBeenCalled();
    expect(cancelCompositorMotion).toHaveBeenCalled();
  });
});

describe("useMotionRunner — what it publishes", () => {
  it("tells consumers to follow per frame while a finger is down", () => {
    render(stationary);
    render(moving({ motionPhase: "dragging", moveReason: "gesture" }));
    expect(lastPlan()).toMatchObject({ kind: "follow", isFallback: false });
    expect(startCompositorMotion).not.toHaveBeenCalled();
  });

  it("marks the follow as a FALLBACK when the compositor declines", () => {
    startCompositorMotion.mockReturnValue(false);
    render(stationary);
    render(moving());
    expect(lastPlan()).toMatchObject({ kind: "follow", isFallback: true });
  });

  it("publishes an instant plan under a reconcile snap, with its direction", () => {
    render(stationary);
    render(moving({ motionPhase: "step-instant" }));
    expect(lastPlan()).toMatchObject({ kind: "instant", direction: 1 });
    expect(startCompositorMotion).not.toHaveBeenCalled();
  });

  it("carries the curve, the clock and the destination on a composited ride", () => {
    render(stationary);
    render(moving());
    const plan = lastPlan();
    expect(plan.kind).toBe("waapi");
    if (plan.kind !== "waapi") return;
    expect(plan.duration).toBeGreaterThan(0);
    expect(plan.stops.length).toBeGreaterThan(1);
    expect(plan.direction).toBe(1);
    expect(plan.targetKey).toBe(3);
    expect(plan.isContinuation).toBe(false);
  });

  it("gives a far GO_TO a plan spanning the WHOLE command, not the preflight", () => {
    // A teleport publishes one plan for preflight + approach, re-authored over
    // a unit step, so a one-step consumer animates the whole journey once.
    render(stationary);
    const preflight = moving({
      motionPhase: "step-jump",
      virtualIndex: 3,
      teleportVirtualIndex: 27,
      targetPageIndex: 9,
    });
    render(preflight);

    const plan = lastPlan();
    expect(plan.kind).toBe("waapi");
    if (plan.kind !== "waapi") return;
    // The destination the consumer is told about is the FAR one.
    expect(plan.targetKey).toBe(27);
    expect(plan.isJump).toBe(true);
  });

  it("flags the post-teleport approach as a continuation", () => {
    render(stationary);
    render(
      moving({
        motionPhase: "step-jump",
        virtualIndex: 27,
        isTeleportApproach: true,
        targetPageIndex: 9,
      }),
    );
    const plan = lastPlan();
    expect(plan.kind).toBe("waapi");
    if (plan.kind !== "waapi") return;
    expect(plan.isContinuation).toBe(true);
  });

  /**
   * The plan and the compositor ride are two deliveries of ONE segment, and
   * the only thing holding the three paint consumers in phase is that both are
   * pinned to the SAME clock. Let the plan carry its own `startedAt` and the
   * dots and the widget run a few frames off the deck — a drift nobody can
   * point at, on a deck where every individual part looks correct.
   *
   * The curve may legitimately differ between the two (a preflight re-authors
   * it over a unit step for one-step consumers). The clock may not.
   */
  it("publishes the plan on the same clock the compositor was given", () => {
    render(stationary);
    render(moving());

    const ride = startCompositorMotion.mock.calls[0]![0];
    const plan = lastPlan();
    expect(plan.kind).toBe("waapi");
    if (plan.kind !== "waapi") return;

    expect(plan.startedAt).toBe(ride.startedAt);
    // An ordinary ride hands over the very same curve as well.
    expect(plan.duration).toBe(ride.duration);
    expect(plan.stops).toEqual(ride.stops);
  });

  it("keeps that clock on a far GO_TO, where the curve deliberately differs", () => {
    render(stationary);
    render(
      moving({
        motionPhase: "step-jump",
        virtualIndex: 3,
        teleportVirtualIndex: 27,
        targetPageIndex: 9,
      }),
    );

    const ride = startCompositorMotion.mock.calls[0]![0];
    const plan = lastPlan();
    if (plan.kind !== "waapi") return;

    expect(plan.startedAt).toBe(ride.startedAt);
    // The compositor got the preflight leg; the plan spans the whole command,
    // so the durations differ ON PURPOSE — which is what makes the shared
    // clock the load-bearing half rather than an accident of equal objects.
    expect(plan.duration).toBeGreaterThan(ride.duration);
  });

  it("returns to rest when the deck settles back to idle", () => {
    render(stationary);
    render(moving());
    render({ ...moving(), motionPhase: "idle", fromVirtualIndex: 3 });
    expect(lastPlan().kind).toBe("idle");
  });
});

describe("useMotionRunner — the controller is the SSOT", () => {
  it("runs the segment on the controller even when the compositor paints it", () => {
    render(stationary);
    render(moving());
    expect(controller!.isActive()).toBe(true);
  });

  it("snaps the controller straight to the outcome on an instant step", () => {
    render(stationary);
    render(moving({ motionPhase: "step-instant" }));
    expect(controller!.getSnapshot().value).toBe(3);
  });

  it("settles without a ride when the distance is already nothing", () => {
    render(stationary);
    // Target equals the live position: nothing to travel, so no ride is built
    // and the channel stays at rest (a repeat idle is deduped, hence no plan).
    render(moving({ virtualIndex: 0, targetPageIndex: 0 }));
    expect(startCompositorMotion).not.toHaveBeenCalled();
    expect(plans).toEqual([]);
    // The controller is pinned on the outcome rather than left mid-nowhere.
    expect(controller!.getSnapshot().value).toBe(0);
    expect(controller!.isActive()).toBe(false);
  });
});

describe("useMotionRunner — teardown", () => {
  it("cancels both the compositor and the controller on unmount", () => {
    render(stationary);
    render(moving());
    const before = cancelCompositorMotion.mock.calls.length;
    const live = controller!;

    act(() => root.unmount());
    root = createRoot(host);

    expect(cancelCompositorMotion.mock.calls.length).toBeGreaterThan(before);
    expect(live.isActive()).toBe(false);
  });
});

describe("useMotionRunner — instant mode switched on mid-ride", () => {
  it("places the deck instead of animating, even before the phase catches up", () => {
    // The host flips `isInstantMode` while a ride is in flight. The reducer
    // only stamps `step-instant` on the NEXT command, so for the frames in
    // between the mode is the only thing that knows, and the runner replans on
    // it (it is part of `replanInputs`).
    //
    // Judged by the phase alone, this rebuild goes to the segment factory with
    // a requested duration of zero — and a zero-duration profile does not
    // collapse to a snap, it stretches: measured at 6 000 000 ms, with the deck
    // still standing at its origin a full second in. Instant mode would freeze
    // the carousel for a hundred minutes.
    render(stationary);
    render(moving());
    expect(startCompositorMotion).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<Probe state={moving()} isInstantMode />);
    });

    // Placed, not flown: no second ride starts, and the controller sits on the
    // outcome rather than crawling towards it.
    expect(startCompositorMotion).toHaveBeenCalledTimes(1);
    expect(controller!.getSnapshot().value).toBe(3);
    expect(controller!.isActive()).toBe(false);
    expect(lastPlan().kind).toBe("instant");
  });
});

/**
 * The plan is not a notification that something started — it is the ride,
 * handed to everyone who paints. The dots and the widget build their own
 * animations from these fields and never look at the deck again, so a wrong
 * direction or a missing flag does not fail here: it shows up as pagination
 * drifting the other way while the deck rides correctly.
 */
describe("useMotionRunner — what the plan carries", () => {
  it("names the direction of travel, both ways", () => {
    render(stationary);
    render(moving());
    expect(lastPlan()).toMatchObject({ kind: "waapi", direction: 1 });

    // Backwards is judged from where the deck IS — the controller's live
    // position — not from the origin the command names.
    render(moving({ virtualIndex: -3, targetPageIndex: 3 }));
    expect(lastPlan()).toMatchObject({ kind: "waapi", direction: -1 });
  });

  it("marks a far jump as a jump, and an ordinary step as not one", () => {
    // The widget draws a jump differently — one continuous sweep instead of a
    // step. It has nothing else to tell them apart by.
    render(stationary);
    render(moving());
    expect(lastPlan()).toMatchObject({ isJump: false });

    render(
      moving({ motionPhase: "step-jump", virtualIndex: 9, targetPageIndex: 3 }),
    );
    expect(lastPlan()).toMatchObject({ isJump: true });
  });

  it("points the followers at the FAR target while a teleport is pending", () => {
    // `virtualIndex` is the preflight landing during a teleport; keyed on it,
    // the followers would re-plan when the deck cuts to the canonical landing
    // and stutter in the middle of one continuous move.
    render(stationary);
    render(
      moving({
        motionPhase: "step-jump",
        virtualIndex: 3,
        teleportVirtualIndex: 15,
      }),
    );
    expect(lastPlan()).toMatchObject({ targetKey: 15 });
  });
});

describe("useMotionRunner — the rides it refuses to start", () => {
  it("a deck that cannot slide is placed, not animated", () => {
    // Mid-ride: the deck loses the ability to slide (the host shrank the
    // deck to one page). The ride must stop being a ride.
    render(stationary);
    render(moving());
    const rides = startCompositorMotion.mock.calls.length;

    render({
      ...moving(),
      layout: { ...moving().layout, canSlide: false },
    });
    expect(startCompositorMotion).toHaveBeenCalledTimes(rides);
    expect(lastPlan().kind).toBe("idle");
    expect(controller!.getSnapshot().value).toBe(3);
    expect(controller!.isActive()).toBe(false);
  });

  it("a target already within the tolerance is snapped, not ridden", () => {
    // Below the motion epsilon there is nothing to travel, and a ride built
    // over that distance is a profile divided by almost nothing.
    render(stationary);
    render(moving());
    const rides = startCompositorMotion.mock.calls.length;

    render(moving({ virtualIndex: config.motion.epsilon / 2 }));
    expect(startCompositorMotion).toHaveBeenCalledTimes(rides);
    expect(lastPlan().kind).toBe("idle");
  });

  it("a deck under the finger freezes where the eye sees it, not at its target", () => {
    // The finger owns the track from this moment. Freezing at `virtualIndex`
    // would tear the strip to the pending target under the held finger.
    render(stationary);
    render(moving());
    cancelCompositorMotion.mockClear();

    render(moving({ motionPhase: "dragging" }));
    expect(lastPlan().kind).toBe("follow");
    const frozenAt = cancelCompositorMotion.mock.calls.at(-1)?.[0];
    expect(frozenAt).toBe(controller!.getSnapshot().value);
    expect(frozenAt).not.toBe(3);
  });
});

/**
 * Where the ride comes FROM — the three answers the runner picks between, and
 * the one thing it must do when the compositor says no.
 *
 * All three origins produce a ride that looks correct in isolation; what
 * separates them is a starting point a few units apart, which on screen is the
 * deck stepping backwards before it sets off. That is why they are pinned by
 * origin rather than by outcome.
 */
describe("useMotionRunner — where a ride starts from", () => {
  it("takes an atomic handoff when a ride is already in flight", () => {
    // Mid-flight the truth is the controller, not the reducer. The two are set
    // deliberately apart here: the deck sits near 0 while the command claims
    // it starts at 5. Trust the command and the deck jumps to 5 before
    // travelling on — the handoff is what keeps it where the eye left it.
    render(stationary);
    render(moving());
    expect(controller!.isActive()).toBe(true);

    render(
      moving({ fromVirtualIndex: 5, virtualIndex: 9, targetPageIndex: 3 }),
    );
    expect(lastPlan().kind).toBe("waapi");
    expect(controller!.getSnapshot().value).toBeLessThan(1);
  });

  it("a cold start takes its origin from the reducer, not the controller", () => {
    // Deliberately a split, not a mixed handoff: the position is the one the
    // reducer decided, and only the residual velocity comes from the
    // controller. Mixing them samples a position from one moment and a speed
    // from another, and the segment starts with the two disagreeing.
    render(stationary);
    render(
      moving({ fromVirtualIndex: 2, virtualIndex: 8, targetPageIndex: 2 }),
    );
    expect(controller!.getSnapshot().value).toBe(2);
  });

  it("a gesture release starts from the coasted position, not the lift-off point", () => {
    // Between the finger leaving and the runner taking over there is a commit
    // gap that nothing paints. The launch point is extrapolated across it, so
    // the ride picks the deck up where it has drifted to — not where it was
    // let go.
    render(stationary);
    render(
      moving({
        moveReason: "gesture",
        fromVirtualIndex: 0,
        virtualIndex: 3,
        gesture: {
          pointerVelocity: 0.01,
          uiVelocity: 0.01,
          launchVelocity: 0.01,
          releasedAt: motionNow() - 40,
        },
      }),
    );
    // Coasted forward from 0 by the release speed over the gap.
    expect(controller!.getSnapshot().value).toBeGreaterThan(0);
  });
});

describe("useMotionRunner — when the compositor refuses", () => {
  it("takes the paint back rather than leaving a dead animation on the track", () => {
    // `false` means the browser would not take the ride. The track still
    // carries whatever the previous animation pinned, so it has to be released
    // at the position the ride is starting from — otherwise the deck sits on a
    // stale transform while the JS loop paints somewhere else.
    startCompositorMotion.mockReturnValue(false);
    render(stationary);
    cancelCompositorMotion.mockClear();

    render(
      moving({ fromVirtualIndex: 2, virtualIndex: 8, targetPageIndex: 2 }),
    );

    // Released AT the ride's own starting point — not at its target, and not
    // merely "released at some point", which the idle branches do anyway.
    expect(cancelCompositorMotion).toHaveBeenCalledWith(2);
    expect(controller!.isActive()).toBe(true);
    // And the plan says WHICH kind of follow this is: a finger-held track and a
    // JS-painted ride are both "follow", and only `isFallback` tells the
    // painters that the frames are theirs to draw.
    expect(lastPlan()).toMatchObject({ kind: "follow", isFallback: true });
  });
});

// The runner also cancels the controller on unmount, and that is deliberately
// NOT pinned here: `useMotionController` tears its own controller down, so
// removing the runner's call changes nothing observable. Defence in depth —
// a test for it would hold the layer, not the behaviour.
