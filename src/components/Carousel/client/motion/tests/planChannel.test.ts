import { describe, expect, it, vi } from "vitest";

import {
  createMotionPlanChannel,
  type MotionPlanListener,
} from "../planChannel";

const waapiPlan = (targetKey: number) =>
  ({
    kind: "waapi",
    direction: 1,
    duration: 1000,
    stops: [0, 0.5, 1],
    startedAt: 0,
    targetKey,
    isContinuation: false,
    isJump: false,
  }) as const;

describe("createMotionPlanChannel", () => {
  it("starts idle with planId 0", () => {
    const { source } = createMotionPlanChannel();
    expect(source.getSnapshot()).toEqual({ kind: "idle", planId: 0 });
  });

  it("publishes with a monotonically increasing planId", () => {
    const { source, publish } = createMotionPlanChannel();
    publish(waapiPlan(3));
    const first = source.getSnapshot();
    publish(waapiPlan(6));
    const second = source.getSnapshot();
    expect(first.planId).toBeGreaterThan(0);
    expect(second.planId).toBeGreaterThan(first.planId);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const { source, publish } = createMotionPlanChannel();
    const listener = vi.fn<MotionPlanListener>();
    const unsubscribe = source.subscribe(listener);
    publish(waapiPlan(3));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].kind).toBe("waapi");
    unsubscribe();
    publish(waapiPlan(6));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dedupes consecutive idle publishes (initial state counts)", () => {
    const { source, publish } = createMotionPlanChannel();
    const listener = vi.fn<MotionPlanListener>();
    source.subscribe(listener);
    publish({ kind: "idle" });
    expect(listener).not.toHaveBeenCalled();
    expect(source.getSnapshot().planId).toBe(0);
  });

  it("dedupes consecutive same-flavour follow publishes but not waapi ones", () => {
    const { source, publish } = createMotionPlanChannel();
    const listener = vi.fn<MotionPlanListener>();
    source.subscribe(listener);
    publish({ kind: "follow", isFallback: false });
    publish({ kind: "follow", isFallback: false });
    expect(listener).toHaveBeenCalledTimes(1);
    publish(waapiPlan(3));
    publish(waapiPlan(3));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("does not dedupe follow publishes whose fallback flavour differs", () => {
    const { source, publish } = createMotionPlanChannel();
    const listener = vi.fn<MotionPlanListener>();
    source.subscribe(listener);
    publish({ kind: "follow", isFallback: false });
    publish({ kind: "follow", isFallback: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
