// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildProfile } from "../profile/profile";
import { createProfileSegment } from "../profile/profileSegment";
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

const segmentTo = (from: number, to: number) =>
  createProfileSegment({
    strategy: "ride",
    from,
    to,
    profile: buildProfile({
      from,
      to,
      startSpeed: 0,
      peakSpeed: 0.01,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.4,
    }),
    startedAt: 1000,
  });

function Probe({
  controller,
  px,
  attach = true,
  paint = true,
}: {
  controller: MotionController<string>;
  px: number;
  attach?: boolean;
  paint?: boolean;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  ride = useCompositedRide(controller, {
    element,
    toKeyframe: paint
      ? (value: number) => ({ transform: `translateX(${value * px}px)` })
      : undefined,
  });
  return attach ? <div ref={element} data-track="" /> : <div data-track="" />;
}

/** The same hook with no defaults at all — the shape a caller that paints
 * elsewhere (or not yet) hands it. */
function BareProbe({ controller }: { controller: MotionController<string> }) {
  ride = useCompositedRide(controller);
  return <div data-track="" />;
}

const render = (
  controller: MotionController<string>,
  px = 1,
  { attach = true, paint = true }: { attach?: boolean; paint?: boolean } = {},
) =>
  act(() => {
    root.render(
      <Probe controller={controller} px={px} attach={attach} paint={paint} />,
    );
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

describe("useCompositedRide — the defaults a ride reads when it starts", () => {
  it("starts the ride on the mounted element with the LATEST geometry", () => {
    // The element and the keyframe fn are read at the moment a ride starts,
    // through accessors, not captured when the rider was built. Capture them
    // and the first commit's geometry rides forever: after a resize the deck
    // flies to the old slot width and lands beside the slide.
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller, 1);
    render(controller, 10);
    act(() => {
      ride?.start({ segment: segmentTo(5, 9) });
    });

    expect(animateMock).toHaveBeenCalledTimes(1);
    expect(animateMock.mock.contexts[0]).toBe(track());
    const keyframes = animateMock.mock.calls[0]?.[0] as Keyframe[];
    expect(keyframes.at(0)?.transform).toBe("translateX(50px)");
    expect(keyframes.at(-1)?.transform).toBe("translateX(90px)");
    // …and the origin is pinned through the same fn, on the same element.
    expect(track().style.transform).toBe("translateX(50px)");
  });

  it("a rider given no defaults rides the JS loop instead of throwing", () => {
    // `defaults` is optional on the hook too, and every accessor has to answer
    // for its absence — a ride started on a bare rider must simply report that
    // the compositor did not take it.
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    act(() => {
      root.render(<BareProbe controller={controller} />);
    });
    let composited: boolean | undefined;
    act(() => {
      composited = ride?.start({ segment: segmentTo(0, 5) });
    });
    act(() => controller.set(4));

    expect(composited).toBe(false);
    expect(animateMock).not.toHaveBeenCalled();
    expect(track().style.transform).toBe("");
  });

  it("an element that never mounted leaves the paint alone", () => {
    // Half the pair present is the dangerous shape: a keyframe fn with no
    // element to write it to. Paint anyway and the sample lands on nothing.
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller, 1, { attach: false });
    act(() => controller.set(4));

    expect(track().style.transform).toBe("");
    expect(animateMock).not.toHaveBeenCalled();
  });

  it("an element with no keyframe fn yet stays on the JS loop", () => {
    // The other half of the pair: a mounted element and no way to turn a
    // value into styles. Absent has to stay absent — hand the ride a
    // keyframe fn that merely forwards to a missing one and the ride throws
    // on its very first pin, where the JS loop would have carried it.
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const controller = createMotionController<string>(0, "idle");

    render(controller, 1, { paint: false });
    let composited: boolean | undefined;
    act(() => {
      composited = ride?.start({ segment: segmentTo(0, 5) });
    });
    act(() => controller.set(4));

    expect(composited).toBe(false);
    expect(animateMock).not.toHaveBeenCalled();
    expect(track().style.transform).toBe("");
  });
});
