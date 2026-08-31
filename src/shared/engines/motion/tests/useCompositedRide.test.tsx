// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMotionController } from "../runtime/createMotionController";
import type { MotionController } from "../runtime/types";
import { useCompositedRide } from "../compositor/compositedRide";

/**
 * The React wrapper around the rider, and the only part of the compositor path
 * with no test of its own.
 *
 * It exists to solve two problems the plain rider cannot. A rider owns a LIVE
 * animation handle, so it cannot be a memo React is free to discard — swapping
 * controllers has to hand back a new rider, not reuse one wired to a dead
 * owner. And the element and keyframe function arrive as props that change
 * between commits, while a ride reads them at the moment it starts — so they
 * are mirrored after the commit rather than captured.
 *
 * Both failures are silent: the deck keeps rendering, and simply stops being
 * painted by the thing that is supposed to paint it.
 */

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock;
});

let host: HTMLDivElement;
let root: Root;
let ride: ReturnType<typeof useCompositedRide<string>> | null;

function Probe({
  controller,
  px,
}: {
  controller: MotionController<string>;
  px: number;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  ride = useCompositedRide(controller, {
    element,
    toKeyframe: (value: number) => ({
      transform: `translateX(${value * px}px)`,
    }),
  });
  return <div ref={element} data-track="" />;
}

const render = (controller: MotionController<string>, px = 1) =>
  act(() => {
    root.render(<Probe controller={controller} px={px} />);
  });

const track = () => host.querySelector("[data-track]") as HTMLElement;

beforeAll(() => {
  animateMock.mockReturnValue({
    startTime: null,
    cancel: vi.fn(),
    onfinish: null,
    oncancel: null,
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("useCompositedRide", () => {
  beforeAll(() => {});

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

  it("paints the element from the controller's samples", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller);
    act(() => controller.set(4));
    expect(track().style.transform).toBe("translateX(4px)");
  });

  it("paints with the LATEST keyframe function, not the one it first saw", () => {
    // The keyframe fn is rebuilt on every commit of the host. Captured once,
    // the deck would keep painting to yesterday's geometry after a resize —
    // the classic "the slot changed and the track did not" bug.
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller, 1);
    render(controller, 10);
    act(() => controller.set(4));
    expect(track().style.transform).toBe("translateX(40px)");
  });
});
