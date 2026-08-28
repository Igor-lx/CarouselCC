// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useVisualPosition,
  type UseVisualPositionResult,
} from "../useVisualPosition";
import { isDroppedFallbackFrame } from "../fallbackPacing";
import type { VisualPositionFrame } from "../types";
import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../config";

/**
 * The single source of "where the deck looks to be", read by three consumers
 * that must agree frame for frame.
 *
 * Two things here are easy to get quietly wrong. `runningFrameIndex` is the
 * streak counter the shared frame-drop rule is computed from, stamped in ONE
 * place precisely so the three consumers cannot disagree about which frame is
 * the Nth. And `sampleNow()` is deliberately a different answer from
 * `getSnapshot()`: the snapshot is the last frame actually PAINTED, the sample
 * is the curve right now. Confusing them makes every new segment start from a
 * stale origin — a small backwards jerk on each handover.
 */

let host: HTMLDivElement;
let root: Root;
let api: UseVisualPositionResult;
let frames: VisualPositionFrame[];

function Probe({ visibleSlidesCount }: { visibleSlidesCount: number }) {
  api = useVisualPosition({ visibleSlidesCount });
  return null;
}

const render = (visibleSlidesCount = 3) =>
  act(() => {
    root.render(<Probe visibleSlidesCount={visibleSlidesCount} />);
  });

beforeEach(() => {
  frames = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useVisualPosition — the frame", () => {
  it("reports the position in both deck units and pages", () => {
    render(3);
    act(() => api.applyImmediatePosition(6));
    const frame = api.source.getSnapshot();
    expect(frame.position).toBe(6);
    expect(frame.pageOffset).toBe(2);
  });

  it("re-expresses the SAME position when the page size changes", () => {
    render(3);
    act(() => api.applyImmediatePosition(6));
    expect(api.source.getSnapshot().pageOffset).toBe(2);

    render(2);
    expect(api.source.getSnapshot().position).toBe(6);
    expect(api.source.getSnapshot().pageOffset).toBe(3);
  });

  it("emits the current frame to a new subscriber unless told not to", () => {
    render();
    act(() => api.applyImmediatePosition(4));

    let eager: VisualPositionFrame | null = null;
    api.source.subscribe((f) => (eager = f))();
    expect(eager).not.toBeNull();

    let quiet: VisualPositionFrame | null = null;
    api.source.subscribe((f) => (quiet = f), { emitCurrent: false })();
    expect(quiet).toBeNull();
  });

  it("stops delivering to a listener that unsubscribed", () => {
    render();
    const stop = api.source.subscribe((f) => frames.push(f), {
      emitCurrent: false,
    });
    act(() => api.applyImmediatePosition(1));
    const delivered = frames.length;

    stop();
    act(() => api.applyImmediatePosition(2));
    expect(frames.length).toBe(delivered);
  });
});

describe("useVisualPosition — the running streak", () => {
  it("stamps zero on a resting frame", () => {
    render();
    act(() => api.applyImmediatePosition(3));
    const frame = api.source.getSnapshot();
    expect(frame.phase).not.toBe("running");
    expect(frame.runningFrameIndex).toBe(0);
  });

  it("keeps the drop rule off resting frames, whatever the counter says", () => {
    // The shared rule only ever sheds RUNNING frames: a drag or a settle must
    // always paint, or the deck visibly stalls.
    render();
    act(() => api.applyImmediatePosition(3));
    expect(isDroppedFallbackFrame(api.source.getSnapshot())).toBe(false);
  });

  it("sheds exactly every Nth running frame and never the first", () => {
    // Pure function over the frame, so the three consumers compute the same
    // answer from the same stamp — this is the contract that keeps them synced.
    const nth = FALLBACK_DROP_EVERY_NTH_FRAME;
    const running = (runningFrameIndex: number): VisualPositionFrame => ({
      ...api.source.getSnapshot(),
      phase: "running",
      runningFrameIndex,
    });

    render();
    expect(isDroppedFallbackFrame(running(0))).toBe(false);
    for (let index = 0; index < nth * 3; index += 1) {
      expect(isDroppedFallbackFrame(running(index))).toBe(
        (index + 1) % nth === 0,
      );
    }
  });
});

describe("useVisualPosition — reading the position", () => {
  it("agrees with the snapshot while the deck is at rest", () => {
    render();
    act(() => api.applyImmediatePosition(5));
    expect(api.source.sampleNow()).toBe(5);
    expect(api.source.getSnapshot().position).toBe(5);
  });

  it("hands the controller through as the position SSOT", () => {
    render();
    act(() => api.applyImmediatePosition(5));
    // Same number, one owner: the hook publishes the controller's value rather
    // than keeping a second copy that could drift from it.
    expect(api.controller.getSnapshot().value).toBe(5);
  });

  it("an immediate apply lands at rest, not mid-flight", () => {
    render();
    act(() => api.applyImmediatePosition(7));
    expect(api.controller.isActive()).toBe(false);
    expect(api.source.getSnapshot().velocity).toBe(0);
  });
});
