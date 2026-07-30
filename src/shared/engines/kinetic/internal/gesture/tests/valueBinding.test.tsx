// @vitest-environment jsdom
/**
 * FORK of `shared/engines/gesture/tests/valueBinding.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";
import type { PointerSwipeMovePayload } from "../swipe/types";

/**
 * The drag→value binding contract: anchored by `read()` at drag ACTIVATION,
 * `write(anchor + uiOffset)` on activation and every move, nothing written
 * for taps or vertical hand-backs, callbacks observing the fresh value.
 *
 * jsdom has no PointerEvent; a MouseEvent with the pointer fields defined on
 * it carries through React's delegation just as well (the synthetic event
 * reads fields straight off the native object). setPointerCapture is absent
 * too — the engine's own try/catch guards are what make this dispatchable.
 */

let host: HTMLDivElement;
let root: Root;
let surface: HTMLElement | null = null;

const pointerEvent = (
  type: string,
  { x, y, t }: { x: number; y: number; t?: number },
): Event => {
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
  // The engine clocks the gesture off the EVENT's timestamp; a synthetic one
  // lets a test cross the release cooldown without real waiting.
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const dispatch = (type: string, point: { x: number; y: number; t?: number }) =>
  act(() => {
    surface!.dispatchEvent(pointerEvent(type, point));
  });

const drag = (points: Array<{ x: number; y: number; t?: number }>) => {
  dispatch("pointerdown", points[0]!);
  for (const point of points.slice(1)) dispatch("pointermove", point);
  dispatch("pointerup", points[points.length - 1]!);
};

interface Recorded {
  reads: number;
  writes: number[];
  moves: PointerSwipeMovePayload[];
}

const mount = (readValue: () => number): Recorded => {
  const recorded: Recorded = { reads: 0, writes: [], moves: [] };
  const Probe = () => {
    const { hostProps } = usePointerSwipe({
      value: {
        read: () => {
          recorded.reads += 1;
          return readValue();
        },
        write: (v) => recorded.writes.push(v),
      },
      onDragMove: (payload) => recorded.moves.push(payload),
    });
    return <div {...hostProps} data-surface />;
  };
  act(() => root.render(<Probe />));
  surface = host.querySelector("[data-surface]");
  return recorded;
};

beforeEach(() => {
  vi.useRealTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  surface = null;
});

describe("usePointerSwipe value binding", () => {
  it("anchors at activation and writes anchor + uiOffset on every move", () => {
    const recorded = mount(() => 500);
    drag([
      { x: 100, y: 10 },
      { x: 120, y: 10 }, // crosses the intent threshold -> activation
      { x: 160, y: 10 },
      { x: 200, y: 10 },
    ]);

    expect(recorded.reads).toBe(1);
    // Activation write continues the value seamlessly: uiOffset is measured
    // from the re-anchored finger, so the first write IS the anchor.
    expect(recorded.writes[0]).toBeCloseTo(500, 10);
    // Every move writes anchor + the SAME uiOffset the callback observes.
    expect(recorded.writes.length).toBe(recorded.moves.length);
    recorded.moves.forEach((payload, i) => {
      expect(recorded.writes[i]).toBeCloseTo(500 + payload.uiOffset, 10);
    });
    // And the drag really travelled.
    expect(recorded.writes[recorded.writes.length - 1]!).toBeGreaterThan(500);
  });

  it("writes nothing for a tap (no activation)", () => {
    const recorded = mount(() => 500);
    dispatch("pointerdown", { x: 100, y: 10 });
    dispatch("pointerup", { x: 100, y: 10 });
    expect(recorded.reads).toBe(0);
    expect(recorded.writes).toEqual([]);
  });

  it("writes nothing when the press turns vertical (handed to the browser)", () => {
    const recorded = mount(() => 500);
    dispatch("pointerdown", { x: 100, y: 10 });
    dispatch("pointermove", { x: 103, y: 60 }); // vertical intent
    dispatch("pointerup", { x: 103, y: 60 });
    expect(recorded.reads).toBe(0);
    expect(recorded.writes).toEqual([]);
  });

  it("re-anchors per gesture from the fresh read()", () => {
    vi.useFakeTimers(); // drives the cooldown's setTimeout
    let value = 500;
    const recorded = mount(() => value);
    drag([
      { x: 100, y: 10, t: 1000 },
      { x: 120, y: 10, t: 1016 },
      { x: 180, y: 10, t: 1032 },
    ]);
    value = recorded.writes[recorded.writes.length - 1]!; // "settled" where it was left
    const writesAfterFirst = recorded.writes.length;

    act(() => void vi.advanceTimersByTime(400)); // cooldown phase expires

    // Event clock far past lockUntil: the second gesture is accepted.
    drag([
      { x: 300, y: 10, t: 5000 },
      { x: 280, y: 10, t: 5016 }, // backwards this time
      { x: 240, y: 10, t: 5032 },
    ]);
    expect(recorded.reads).toBe(2);
    const secondWrites = recorded.writes.slice(writesAfterFirst);
    // Second drag starts from the new anchor and moves the value DOWN.
    expect(secondWrites[0]).toBeCloseTo(value, 10);
    expect(secondWrites[secondWrites.length - 1]!).toBeLessThan(value);
  });
});
