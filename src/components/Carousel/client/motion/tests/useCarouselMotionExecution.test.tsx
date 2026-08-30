// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CarouselDispatch } from "../../state";
import { useCarouselMotionExecution } from "../useCarouselMotionExecution";
import type { UseMotionRunnerInput } from "../useMotionRunner";

/**
 * The wrapper's whole job is the seam between the runner and the reducer: the
 * runner reports a POSITION, the reducer wants a COMMAND. Two things can break
 * silently here. Report the wrong number and the reducer re-anchors to a place
 * the deck never settled at. Hand the runner a fresh `onSettle` every render
 * and its effects re-key on every parent render — the ride is torn down and
 * re-planned mid-flight, which looks like a stutter, not like a bug.
 */

const seen: UseMotionRunnerInput[] = [];

vi.mock("../useMotionRunner", () => ({
  useMotionRunner: (input: UseMotionRunnerInput) => {
    seen.push(input);
  },
}));

const runnerInput = {
  state: { virtualIndex: 3 },
  config: { motion: {} },
  controller: {},
  isInstantMode: false,
  startCompositorMotion: () => {},
  cancelCompositorMotion: () => {},
  publishPlan: () => {},
} as unknown as Omit<UseMotionRunnerInput, "onSettle">;

let host: HTMLDivElement;
let root: Root;

const Host = ({ dispatch }: { dispatch: CarouselDispatch }) => {
  useCarouselMotionExecution({ ...runnerInput, dispatch });
  return null;
};

const render = (dispatch: CarouselDispatch) =>
  act(() => {
    root.render(<Host dispatch={dispatch} />);
  });

const last = () => seen[seen.length - 1]!;

beforeEach(() => {
  seen.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useCarouselMotionExecution", () => {
  it("turns a settled position into MOTION_SETTLED carrying that position", () => {
    const dispatch = vi.fn() as unknown as CarouselDispatch;
    render(dispatch);
    act(() => last().onSettle(4.25));
    expect(dispatch).toHaveBeenCalledWith({
      type: "MOTION_SETTLED",
      settledPosition: 4.25,
    });
  });

  it("passes the runner's own input through untouched", () => {
    render(vi.fn());
    const { onSettle, ...forwarded } = last();
    expect(forwarded).toEqual(runnerInput);
    expect(onSettle).toBeTypeOf("function");
  });

  it("keeps one callback identity while the dispatch is the same", () => {
    // The runner keys effects on its input; a new callback per render would
    // re-plan a ride that is already in flight.
    const dispatch = vi.fn() as unknown as CarouselDispatch;
    render(dispatch);
    const first = last().onSettle;
    render(dispatch);
    expect(seen).toHaveLength(2);
    expect(last().onSettle).toBe(first);
  });

  it("follows the dispatch when the dispatch itself is replaced", () => {
    const first = vi.fn() as unknown as CarouselDispatch;
    render(first);
    const second = vi.fn() as unknown as CarouselDispatch;
    render(second);
    act(() => last().onSettle(1));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
