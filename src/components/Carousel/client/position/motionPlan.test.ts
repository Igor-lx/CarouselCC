import { describe, expect, it, vi } from "vitest";

import { createMotionPlanSource } from "./motionPlan";

const LINEAR = { x1: 0, y1: 0, x2: 1, y2: 1 };
const plan = (fromPageOffset: number, toPageOffset: number) => ({
  fromPageOffset,
  toPageOffset,
  duration: 400,
  easing: LINEAR,
});

describe("createMotionPlanSource", () => {
  it("starts empty", () => {
    expect(createMotionPlanSource().getPlan()).toBeNull();
  });

  it("publish stamps a monotonically increasing version", () => {
    const src = createMotionPlanSource();
    src.publish(plan(0, 1));
    expect(src.getPlan()?.version).toBe(1);
    src.publish(plan(1, 2));
    expect(src.getPlan()?.version).toBe(2);
    src.publish(null); // a clear also advances the version
    expect(src.getPlan()).toBeNull();
    src.publish(plan(2, 3));
    expect(src.getPlan()?.version).toBe(4);
  });

  it("carries the published fields through unchanged", () => {
    const src = createMotionPlanSource();
    src.publish(plan(0.5, 3.5));
    const current = src.getPlan();
    expect(current).toMatchObject({
      fromPageOffset: 0.5,
      toPageOffset: 3.5,
      duration: 400,
      easing: LINEAR,
    });
  });

  it("notifies subscribers on publish and clear", () => {
    const src = createMotionPlanSource();
    const listener = vi.fn();
    src.subscribe(listener);
    src.publish(plan(0, 1));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ version: 1 }));
    src.publish(null);
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", () => {
    const src = createMotionPlanSource();
    const listener = vi.fn();
    const unsubscribe = src.subscribe(listener);
    src.publish(plan(0, 1));
    unsubscribe();
    src.publish(plan(1, 2));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
