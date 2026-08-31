// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/useMotionPaint.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMotionController } from "../runtime/createMotionController";
import { useMotionPaint } from "../runtime/useMotionPaint";
import type { MotionSample } from "../runtime/types";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useMotionPaint", () => {
  it("paints the resting sample immediately and every set() after", () => {
    const controller = createMotionController(7);
    const paint = vi.fn<(sample: MotionSample) => void>();
    const Probe = () => {
      useMotionPaint(controller, paint);
      return null;
    };
    act(() => root.render(<Probe />));

    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0]![0].value).toBe(7);

    act(() => controller.set(12));
    expect(paint).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 12 }),
    );
  });

  it("always calls the LATEST closure without resubscribing", () => {
    const controller = createMotionController(0);
    const seen: string[] = [];
    const Probe = ({ tag }: { tag: string }) => {
      useMotionPaint(controller, ({ value }) => seen.push(`${tag}:${value}`));
      return null;
    };
    act(() => root.render(<Probe tag="a" />));
    act(() => root.render(<Probe tag="b" />)); // re-render, new closure
    act(() => controller.set(5));

    // No duplicate subscription (one emit per set), and the fresh closure won.
    expect(seen.filter((s) => s.endsWith(":5"))).toEqual(["b:5"]);
  });

  it("follows a replaced controller and lets the old one go", () => {
    // The controller can arrive as a prop: a host that swaps its motion
    // source must be repainted from the new one. Subscribed once and never
    // again, the deck keeps painting a curve nobody drives any more while the
    // live one moves invisibly.
    const first = createMotionController(1);
    const second = createMotionController(2);
    const seen: number[] = [];
    const Probe = ({ source }: { source: typeof first }) => {
      useMotionPaint(source, ({ value }) => seen.push(value));
      return null;
    };

    act(() => root.render(<Probe source={first} />));
    act(() => root.render(<Probe source={second} />));
    seen.length = 0;

    act(() => second.set(20));
    act(() => first.set(10));

    expect(seen).toEqual([20]);
  });

  it("unsubscribes on unmount", () => {
    const controller = createMotionController(0);
    const paint = vi.fn<(sample: MotionSample) => void>();
    const Probe = () => {
      useMotionPaint(controller, paint);
      return null;
    };
    act(() => root.render(<Probe />));
    act(() => root.unmount());
    paint.mockClear();
    act(() => controller.set(99));
    expect(paint).not.toHaveBeenCalled();
  });
});
