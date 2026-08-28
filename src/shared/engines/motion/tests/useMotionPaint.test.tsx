// @vitest-environment jsdom
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
    expect(paint).toHaveBeenLastCalledWith(expect.objectContaining({ value: 12 }));
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
