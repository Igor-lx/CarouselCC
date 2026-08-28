import { describe, expect, it } from "vitest";

import {
  resolveWidgetStepTarget,
  WIDGET_STEP_LOOKAHEAD,
  type WidgetStepMemory,
} from "../stepTarget";

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

/**
 * The chain is bounded against the LIVE offset, and that bound is what the
 * strip's pooled dots and highlight overlays are sized from. Without it a click
 * burst walks the destination past every element that exists to show it, and
 * `activeTrajectoryIds` then names more ids than there are overlays — the
 * extras drop from the front of the list, so a forward burst loses the ARRIVING
 * page's highlight and it pops into place at settle.
 *
 * Written against the constant, not against the number: retuning the reach must
 * not fail these, only move them.
 */
describe("resolveWidgetStepTarget — the lookahead bound", () => {
  const chain = (from: number, memory: WidgetStepMemory, direction: 1 | -1) =>
    resolveWidgetStepTarget({
      direction,
      targetKey: memory.targetKey + 1,
      from,
      previous: memory,
      interrupted: null,
    });

  it("a click burst can never outrun the live offset by more than the reach", () => {
    let memory: WidgetStepMemory = { target: 0, direction: 1, targetKey: 0 };
    const from = 0.2; // the strip has barely moved while the clicks land
    for (let click = 0; click < 50; click += 1) {
      const target = chain(from, memory, 1);
      expect(target).toBeLessThanOrEqual(
        Math.floor(from) + WIDGET_STEP_LOOKAHEAD,
      );
      memory = { target, direction: 1, targetKey: memory.targetKey + 1 };
    }
  });

  it("holds symmetrically going backwards", () => {
    let memory: WidgetStepMemory = { target: 0, direction: -1, targetKey: 0 };
    const from = -0.2;
    for (let click = 0; click < 50; click += 1) {
      const target = chain(from, memory, -1);
      expect(target).toBeGreaterThanOrEqual(
        Math.ceil(from) - WIDGET_STEP_LOOKAHEAD,
      );
      memory = { target, direction: -1, targetKey: memory.targetKey + 1 };
    }
  });

  it("still advances as the strip catches up — the bound tracks the offset", () => {
    // Same burst, but the strip is moving: each step lands one beyond the last,
    // because the reach travels with `from`.
    let memory: WidgetStepMemory = { target: 1, direction: 1, targetKey: 0 };
    for (let step = 0; step < 5; step += 1) {
      const from = step + 0.5;
      const target = chain(from, memory, 1);
      expect(target).toBe(memory.target + 1);
      memory = { target, direction: 1, targetKey: memory.targetKey + 1 };
    }
  });

  it("a same-key re-plan cannot deliver an out-of-reach target either", () => {
    // A long drag moves the offset far from the step the grab tore down; the
    // retime must still land somewhere the pooled elements cover.
    const target = resolveWidgetStepTarget({
      direction: 1,
      targetKey: 15,
      from: -6.4,
      previous: null,
      interrupted: stepTo5,
    });
    expect(target).toBeLessThanOrEqual(
      Math.floor(-6.4) + WIDGET_STEP_LOOKAHEAD,
    );
  });
});
