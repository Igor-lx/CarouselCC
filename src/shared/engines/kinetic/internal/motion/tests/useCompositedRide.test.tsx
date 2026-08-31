// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/useCompositedRide.test.tsx`, and one of
 * the few that is NOT byte-identical — on purpose.
 *
 * The library's hook also owns the painting: it takes the element and the
 * keyframe function as defaults and wires the paint subscription itself. This
 * fork trims that half (`Fork trims flyTo/dragBinding`), and the facade paints
 * for itself — `useKineticValue` holds its own `useMotionPaint`. So the two
 * painting cases of the original have no counterpart here: there is no node to
 * make the assertion about.
 *
 * What DOES carry across is the reason the hook exists at all — a rider owns a
 * live animation handle, so it cannot be a memo React is free to discard, and
 * swapping controllers has to hand back a rider wired to the new owner.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMotionController } from "../runtime/createMotionController";
import type { MotionController } from "../runtime/types";
import { useCompositedRide } from "../compositor/compositedRide";

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock;
  animateMock.mockReturnValue({
    startTime: null,
    cancel: vi.fn(),
    onfinish: null,
    oncancel: null,
  });
});

let host: HTMLDivElement;
let root: Root;
let ride: ReturnType<typeof useCompositedRide<string>> | null;

function Probe({ controller }: { controller: MotionController<string> }) {
  ride = useCompositedRide(controller);
  return null;
}

const render = (controller: MotionController<string>) =>
  act(() => {
    root.render(<Probe controller={controller} />);
  });

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("useCompositedRide", () => {
  it("hands back the same rider while the controller stays the same", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller);
    const first = ride;
    render(controller);
    // A rider rebuilt per render would abandon the animation handle it owns —
    // the ride keeps playing with nobody left holding it.
    expect(ride).toBe(first);
  });

  it("builds a new rider when the controller is replaced", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    render(createMotionController<string>(0, "idle"));
    const first = ride;
    render(createMotionController<string>(0, "idle"));
    // Reusing the old rider would leave it wired to a controller nobody reads
    // any more: every later ride would be started on the wrong owner.
    expect(ride).not.toBe(first);
  });
});
