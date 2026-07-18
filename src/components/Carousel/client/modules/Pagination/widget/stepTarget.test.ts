import { describe, expect, it } from "vitest";

import { resolveWidgetStepTarget } from "./stepTarget";

const stepTo5 = { target: 5, direction: 1, targetKey: 15 };

describe("resolveWidgetStepTarget", () => {
  it("repeat CLICK (live step, new key, same direction) advances one beyond", () => {
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 18,
        from: 4.3,
        previous: stepTo5,
        interrupted: null,
      }),
    ).toBe(6);
  });

  it("repeat SWIPE (grab tore the step down, new key, same direction) advances one beyond too", () => {
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 18,
        from: 4.3,
        previous: null,
        interrupted: stepTo5,
      }),
    ).toBe(6);
  });

  it("same targetKey keeps the target (retiming / snap to the same incoming page)", () => {
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 15,
        from: 4.6,
        previous: null,
        interrupted: stepTo5,
      }),
    ).toBe(5);
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 15,
        from: 4.6,
        previous: stepTo5,
        interrupted: null,
      }),
    ).toBe(5);
  });

  it("opposite direction after a grab falls back to geometry (return toward origin)", () => {
    expect(
      resolveWidgetStepTarget({
        direction: -1,
        targetKey: 12,
        from: 4.3,
        previous: null,
        interrupted: stepTo5,
      }),
    ).toBe(4);
  });

  it("fresh steps use plain geometry; snap rounds to the nearest step", () => {
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 3,
        from: 2,
        previous: null,
        interrupted: null,
      }),
    ).toBe(3);
    expect(
      resolveWidgetStepTarget({
        direction: -1,
        targetKey: 3,
        from: 2,
        previous: null,
        interrupted: null,
      }),
    ).toBe(1);
    expect(
      resolveWidgetStepTarget({
        direction: 0,
        targetKey: 3,
        from: 2.4,
        previous: null,
        interrupted: null,
      }),
    ).toBe(2);
  });

  it("the live step outranks the interrupted memory", () => {
    expect(
      resolveWidgetStepTarget({
        direction: 1,
        targetKey: 21,
        from: 5.2,
        previous: { target: 6, direction: 1, targetKey: 18 },
        interrupted: stepTo5,
      }),
    ).toBe(7);
  });
});
