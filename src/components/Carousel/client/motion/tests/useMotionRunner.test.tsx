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

function Probe({ state }: { state: CarouselState }) {
  const ctrl = useMotionController<CarouselMotionStrategy>(0, "idle");
  controller = ctrl;
  useMotionRunner({
    state,
    config,
    controller: ctrl,
    isInstantMode: false,
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
