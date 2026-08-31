// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/useMotionController.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useMotionController } from "../runtime/useMotionController";
import type { MotionController } from "../runtime/types";

/**
 * The hook that owns a controller's lifetime.
 *
 * A controller is not a value React may recreate: it owns a frame loop, a
 * settle timer and a subscriber list. Built once per instance, and released
 * when the owner goes — softly, because StrictMode mounts twice and a
 * remount must find the same controller still usable.
 */

let host: HTMLDivElement;
let root: Root;
let controller: MotionController<string> | null = null;

const Probe = () => {
  controller = useMotionController<string>(7, "idle");
  return null;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  controller = null;
});

afterEach(() => {
  host.remove();
});

describe("useMotionController", () => {
  it("builds one controller and keeps it across renders", () => {
    act(() => root.render(<Probe />));
    const first = controller;
    act(() => root.render(<Probe />));

    // A controller rebuilt on a render would leave the running ride playing
    // into a subscriber list nobody reads any more.
    expect(controller).toBe(first);
    expect(controller?.getSnapshot().value).toBe(7);
  });

  it("releases the controller when its owner unmounts", () => {
    act(() => root.render(<Probe />));
    const owned = controller!;
    const paint = vi.fn();
    owned.subscribe(paint, { emitCurrent: false });

    act(() => root.unmount());
    paint.mockClear();
    owned.set(12);

    // Left undestroyed, the controller keeps delivering to listeners that
    // belong to a tree React has already thrown away.
    expect(paint).not.toHaveBeenCalled();
  });

  it("hands back a controller that still works after that release", () => {
    // StrictMode mounts, unmounts and mounts again: the teardown is soft on
    // purpose, so the second mount finds a controller it can still use.
    act(() => root.render(<Probe />));
    const owned = controller!;
    act(() => root.unmount());

    owned.set(21);
    expect(owned.getSnapshot().value).toBe(21);
  });
});
