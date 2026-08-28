// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useKineticValue } from "../useKineticValue";
import type { KineticValue } from "../internal/types";

/**
 * The blank's promise: JSX + one keyframe function IS the whole deployment.
 * These tests drive it exactly the way an app would — real pointer dispatch
 * on the host, a mocked `Element.animate` for the compositor half — and
 * check the fused behaviours: drag paints, release glides on momentum, a
 * micro-twitch rests, flyTo rides pinned to the motion clock.
 */

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock;
});

interface FakeAnimation {
  startTime: number | null;
  cancel: () => void;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
}
const fakeAnimation = (): FakeAnimation => ({
  startTime: null,
  cancel: vi.fn(),
  onfinish: null,
  oncancel: null,
});

let host: HTMLDivElement;
let root: Root;
let surface: HTMLElement | null = null;
let circle: HTMLElement | null = null;
let api: KineticValue | null = null;

const translateOf = (keyframe: Keyframe | undefined): number => {
  const match = /translateX\((-?[\d.]+)px\)/.exec(String(keyframe?.transform ?? ""));
  return match ? Number.parseFloat(match[1]!) : Number.NaN;
};

const pointerEvent = (type: string, { x, y, t }: { x: number; y: number; t?: number }) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};
const dispatch = (type: string, point: { x: number; y: number; t?: number }) =>
  act(() => {
    surface!.dispatchEvent(pointerEvent(type, point));
  });

const mount = (props: Parameters<typeof useKineticValue>[0]) => {
  const Probe = () => {
    api = useKineticValue(props);
    return (
      <div {...api.hostProps} data-surface>
        <div ref={api.ref} data-circle />
      </div>
    );
  };
  act(() => root.render(<Probe />));
  surface = host.querySelector("[data-surface]");
  circle = host.querySelector("[data-circle]");
};

const KEYFRAME = (x: number) => ({ transform: `translateX(${x}px)` });

beforeEach(() => {
  animateMock.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  surface = null;
  circle = null;
  api = null;
});

describe("useKineticValue", () => {
  it("paints the initial value on mount — no unstyled flash", () => {
    mount({ keyframe: KEYFRAME, initialValue: 40 });
    expect(circle!.style.transform).toBe("translateX(40px)");
  });

  it("a drag moves the element 1:1 with the engine's offset", () => {
    mount({ keyframe: KEYFRAME });
    dispatch("pointerdown", { x: 100, y: 10, t: 1000 });
    dispatch("pointermove", { x: 120, y: 10, t: 1016 }); // activation
    dispatch("pointermove", { x: 180, y: 10, t: 1032 });

    const dragged = translateOf({ transform: circle!.style.transform });
    expect(dragged).toBeGreaterThan(0); // moved right, painted through the controller
    expect(api!.value()).toBeCloseTo(dragged, 6);
  });

  it("a fast release glides on momentum — a composited ride beyond the drop point", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    mount({ keyframe: KEYFRAME });

    dispatch("pointerdown", { x: 100, y: 10, t: 1000 });
    dispatch("pointermove", { x: 130, y: 10, t: 1016 });
    dispatch("pointermove", { x: 170, y: 10, t: 1032 });
    const beforeRelease = api!.value();
    dispatch("pointerup", { x: 170, y: 10, t: 1040 });

    expect(animateMock).toHaveBeenCalledTimes(1);
    const keyframes = animateMock.mock.calls[0]![0] as Keyframe[];
    expect(translateOf(keyframes[0])).toBeCloseTo(beforeRelease, 4);
    expect(translateOf(keyframes[keyframes.length - 1])).toBeGreaterThan(beforeRelease);
  });

  it("a slow drop just rests: no ride, onSettle fires where it was dropped", () => {
    const onSettle = vi.fn();
    mount({ keyframe: KEYFRAME, onSettle });

    dispatch("pointerdown", { x: 100, y: 10, t: 1000 });
    dispatch("pointermove", { x: 120, y: 10, t: 2000 }); // ~0.02 px/ms — crawl
    dispatch("pointermove", { x: 125, y: 10, t: 3000 });
    dispatch("pointerup", { x: 125, y: 10, t: 4000 });

    expect(animateMock).not.toHaveBeenCalled();
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle.mock.calls[0]![0]).toBeCloseTo(api!.value(), 6);
  });

  it("resolveTarget owns the landing: snap to a grid", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    mount({
      keyframe: KEYFRAME,
      resolveTarget: ({ from }) => Math.round(from / 200) * 200,
    });

    dispatch("pointerdown", { x: 100, y: 10, t: 1000 });
    dispatch("pointermove", { x: 130, y: 10, t: 1016 });
    dispatch("pointermove", { x: 190, y: 10, t: 1032 });
    dispatch("pointerup", { x: 190, y: 10, t: 1040 });

    const keyframes = animateMock.mock.calls[0]![0] as Keyframe[];
    expect(translateOf(keyframes[keyframes.length - 1])).toBe(0); // nearest grid line
  });

  it("flyTo rides the compositor pinned to the motion clock and parks on finish", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    mount({ keyframe: KEYFRAME });

    act(() => api!.flyTo(300));

    expect(animateMock).toHaveBeenCalledTimes(1);
    expect(typeof anim.startTime).toBe("number"); // pinned
    const keyframes = animateMock.mock.calls[0]![0] as Keyframe[];
    expect(translateOf(keyframes[0])).toBe(0);
    expect(translateOf(keyframes[keyframes.length - 1])).toBe(300);

    act(() => anim.onfinish?.());
    expect(circle!.style.transform).toBe("translateX(300px)"); // parked exactly
  });

  it("the finger catches a flying value: the ride dies pinned, the drag continues it", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    mount({ keyframe: KEYFRAME });

    act(() => api!.flyTo(300));
    dispatch("pointerdown", { x: 100, y: 10, t: 1000 });
    dispatch("pointermove", { x: 120, y: 10, t: 1016 }); // activation -> read() -> catch

    expect(anim.cancel).toHaveBeenCalled();
    // The drag now owns the value from the caught position onward.
    const caught = api!.value();
    dispatch("pointermove", { x: 160, y: 10, t: 1032 });
    expect(api!.value()).toBeGreaterThan(caught);
  });
});
