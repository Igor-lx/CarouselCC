import { describe, expect, it } from "vitest";

import { resolveCoastFrame } from "./coast";

describe("resolveCoastFrame", () => {
  it("advances by velocity x dt toward the target", () => {
    const frame = resolveCoastFrame({
      position: 0,
      velocity: 0.002,
      dtMs: 16,
      targetVirtualIndex: 3,
    });
    expect(frame.position).toBeCloseTo(0.032, 10);
    expect(frame.done).toBe(false);
  });

  it("clamps AT the target when the step would cross it, and reports done", () => {
    const frame = resolveCoastFrame({
      position: 2.99,
      velocity: 0.002,
      dtMs: 16,
      targetVirtualIndex: 3,
    });
    expect(frame.position).toBe(3);
    expect(frame.done).toBe(true);
  });

  it("is done immediately at zero velocity or when already at the target", () => {
    expect(
      resolveCoastFrame({ position: 1, velocity: 0, dtMs: 16, targetVirtualIndex: 3 }).done,
    ).toBe(true);
    const atTarget = resolveCoastFrame({
      position: 3,
      velocity: 0.002,
      dtMs: 16,
      targetVirtualIndex: 3,
    });
    expect(atTarget.position).toBe(3);
    expect(atTarget.done).toBe(true);
  });

  it("a degenerate dt holds the position without finishing", () => {
    const frame = resolveCoastFrame({
      position: 1,
      velocity: 0.002,
      dtMs: 0,
      targetVirtualIndex: 3,
    });
    expect(frame.position).toBe(1);
    expect(frame.done).toBe(false);
  });

  it("works in the negative direction symmetrically", () => {
    const frame = resolveCoastFrame({
      position: 0,
      velocity: -0.002,
      dtMs: 16,
      targetVirtualIndex: -3,
    });
    expect(frame.position).toBeCloseTo(-0.032, 10);
    expect(frame.done).toBe(false);
  });
});
