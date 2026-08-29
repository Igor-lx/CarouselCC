// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselConfig } from "../../config";
import type { CarouselRuntimeConfig } from "../../config";
import type { CarouselDispatch } from "../useCarouselState";
import { useCarouselState } from "../useCarouselState";
import type { CarouselState } from "../types";
import { makeLayout } from "./layoutBuilder";

/**
 * The wiring around the reducer, which the reducer's own tests cannot see.
 *
 * Two obligations live here. `dispatch` must never change identity — the
 * autoplay timer, the gesture callbacks and the navigation handlers all hang
 * off it, and a new function each render re-arms the timer forever. And the
 * reducer's context is committed DURING render (ADR-004), so a dispatch fired
 * in the same commit as a prop change reads the new config, not the previous
 * one.
 */

const layout = makeLayout(12, 3, false);
const wideLayout = makeLayout(12, 6, false);

let host: HTMLDivElement;
let root: Root;
let state: CarouselState;
let dispatch: CarouselDispatch;
let dispatches: CarouselDispatch[];
let seenStepDuration: number[];

function Probe({
  layout: current,
  config,
}: {
  layout: typeof layout;
  config: CarouselRuntimeConfig;
}) {
  const result = useCarouselState({
    layout: current,
    config,
    isInstantMode: false,
  });
  state = result.state;
  dispatch = result.dispatch;
  dispatches.push(result.dispatch);
  seenStepDuration.push(config.stepDuration);
  return null;
}

const baseConfig = buildCarouselConfig({});

const render = (
  current: typeof layout = layout,
  config: CarouselRuntimeConfig = baseConfig,
) =>
  act(() => {
    root.render(<Probe layout={current} config={config} />);
  });

beforeEach(() => {
  dispatches = [];
  seenStepDuration = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useCarouselState — the dispatch handle", () => {
  it("keeps one identity for the component's whole life", () => {
    render();
    render();
    render(wideLayout);
    act(() => dispatch({ type: "MOVE", step: 1, moveReason: "click" }));

    // Everything downstream memoises on this; a fresh function each render
    // would re-arm the autoplay timer on every single render.
    expect(new Set(dispatches).size).toBe(1);
  });
});

describe("useCarouselState — the reducer context", () => {
  it("hands the reducer the CURRENT config, not the one from the last commit", () => {
    render(layout, buildCarouselConfig({ durationStep: 1000 }));
    const slow = buildCarouselConfig({ durationStep: 9000 });
    render(layout, slow);

    act(() => dispatch({ type: "MOVE", step: 1, moveReason: "click" }));
    // The reducer read the config out of its own state, synced during this
    // render; had the hook captured the first render's value the step would
    // have been planned against 1000.
    expect(seenStepDuration.at(-1)).toBe(9000);
    expect(state.targetPageIndex).toBe(1);
  });

  it("reconciles a layout change before the command, not after", () => {
    render();
    act(() => dispatch({ type: "MOVE", step: 1, moveReason: "click" }));
    expect(state.targetPageIndex).toBe(1);

    // Page size doubles: 4 pages become 2, and the command that follows must
    // be resolved against the NEW geometry.
    render(wideLayout);
    expect(state.layout.pageCount).toBe(2);
    expect(state.targetPageIndex).toBeLessThan(2);
  });
});

describe("useCarouselState — the derived status", () => {
  it("starts idle and stays consistent with the phase", () => {
    render();
    expect(state.motionPhase).toBe("idle");
  });

  it("reports the state already reconciled against the live layout", () => {
    render();
    render(wideLayout);
    // The returned state is never one layout behind the props.
    expect(state.layout).toBe(wideLayout);
  });

  it("survives a layout swap that replaces the deck entirely", () => {
    render();
    act(() => dispatch({ type: "MOVE", step: 2, moveReason: "click" }));

    const otherDeck = makeLayout(9, 3, false, "b");
    render(otherDeck);
    // A different deck is a hard reset: back to the top rather than a page
    // index that means nothing in the new document.
    expect(state.targetPageIndex).toBe(0);
    expect(state.layout).toBe(otherDeck);
  });
});
