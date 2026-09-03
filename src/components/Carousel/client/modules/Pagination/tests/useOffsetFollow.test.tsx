// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../../config";
import {
  isDroppedFallbackFrame,
  type VisualPositionFrame,
  type VisualPositionSource,
} from "../../../visual-position";
import { useOffsetFollow, type OffsetFollow } from "../useOffsetFollow";

/**
 * The follow machine both pagination strips ride, tested once at full depth
 * instead of twice at half depth — which is the whole reason it was pulled out
 * of them.
 *
 * Everything here existed as two near-identical copies, so a fix to one could
 * silently miss the other: the delta anchor that keeps a grab from snapping the
 * strip onto the deck's own number, and the frame-drop rule that has to be
 * re-read per frame because a drag changes flavour mid-subscription.
 */

const frameAt = (
  pageOffset: number,
  extra: Partial<VisualPositionFrame> = {},
): VisualPositionFrame => ({
  position: pageOffset,
  pageOffset,
  velocity: 0,
  target: pageOffset,
  targetPageOffset: pageOffset,
  strategy: "gesture",
  timestamp: 0,
  phase: "idle",
  progress: 0,
  runningFrameIndex: 0,
  ...extra,
});

const createVisualPosition = () => {
  const listeners = new Set<(frame: VisualPositionFrame) => void>();
  let last = frameAt(0);
  const source: VisualPositionSource = {
    getSnapshot: () => last,
    sampleNow: () => last.position,
    wake: () => {},
    subscribe: (listener, options) => {
      listeners.add(listener);
      if (options?.emitCurrent ?? true) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    listenerCount: () => listeners.size,
    emit(frame: VisualPositionFrame) {
      last = frame;
      act(() => {
        listeners.forEach((listener) => listener(frame));
      });
    },
  };
};

let host: HTMLDivElement;
let root: Root;
let visual: ReturnType<typeof createVisualPosition>;
let follow: OffsetFollow;

/** Everything the follower is asked to do, in the order it was asked. */
let journal: string[];
/** Offsets handed to `paint` — dropped frames excluded, by definition. */
let painted: number[];
/** The follower's live position at take-over; the probe controls it. */
let liveOffset: number;
/** The ref the machine advances — read back to tell "moved" from "painted". */
let offsetRef: { current: number };

function Probe({ withStream = true }: { withStream?: boolean }) {
  const ref = useRef(0);
  offsetRef = ref;

  const readLiveOffset = useCallback(() => {
    journal.push("read");
    return liveOffset;
  }, []);
  const onTakeOver = useCallback(() => {
    journal.push("take-over");
  }, []);
  const paint = useCallback((offset: number) => {
    journal.push("paint " + String(offset));
    painted.push(offset);
  }, []);

  follow = useOffsetFollow({
    visualPosition: withStream ? visual.source : null,
    offsetRef: ref,
    readLiveOffset,
    onTakeOver,
    paint,
  });
  return null;
}

const render = (props: { withStream?: boolean } = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

beforeEach(() => {
  journal = [];
  painted = [];
  liveOffset = 0;
  visual = createVisualPosition();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useOffsetFollow — taking the strip over", () => {
  it("reads the live offset BEFORE the follower lets go of it", () => {
    // The follower's live position is sampled from the motion it is running,
    // and `onTakeOver` is what cancels that motion. Read it second and the
    // answer is the resting offset instead, so every grab mid-ride snaps the
    // strip back to where the last step began.
    liveOffset = 2.5;

    act(() => follow.startFollowing(false));

    expect(journal.slice(0, 3)).toEqual(["read", "take-over", "paint 2.5"]);
  });

  it("paints the take-over offset before any frame arrives", () => {
    // The strip has to be hand-painted the instant the compositor lets go of
    // it, or it holds the last frame WAAPI left until the finger moves.
    liveOffset = 1.25;

    act(() => follow.startFollowing(false));

    expect(painted[0]).toBe(1.25);
    expect(offsetRef.current).toBe(1.25);
  });

  it("paints the take-over even when the anchoring frame is shed", () => {
    // Subscribing emits the stream's CURRENT frame at once, and on a fallback
    // ride that frame may be one the drop rule sheds — leaving the hand-paint
    // before the subscription as the only paint the take-over gets.
    visual.emit(
      frameAt(5, {
        phase: "running",
        runningFrameIndex: FALLBACK_DROP_EVERY_NTH_FRAME - 1,
      }),
    );
    liveOffset = 2.5;
    painted.length = 0;

    act(() => follow.startFollowing(true));

    expect(painted).toEqual([2.5]);
  });

  it("does nothing at all without a stream to follow", () => {
    // A host that wires a plan source but no position source. Silence here is
    // the contract — the caller settles instead.
    render({ withStream: false });
    journal.length = 0;

    act(() => follow.startFollowing(false));

    expect(journal).toEqual([]);
    expect(visual.listenerCount()).toBe(0);
  });
});

describe("useOffsetFollow — the delta anchor", () => {
  it("moves by the distance the stream travelled, not to where it is", () => {
    // The deck counts in its own domain and wraps; the strip counts in its own.
    // Reading the first frame as an absolute teleports the strip under the
    // thumb the instant a finger lands on it.
    liveOffset = 3;
    visual.emit(frameAt(40)); // the stream is nowhere near the strip
    act(() => follow.startFollowing(false));
    expect(offsetRef.current).toBe(3); // the anchoring frame moves nothing

    visual.emit(frameAt(40.5));

    expect(offsetRef.current).toBe(3.5);
    expect(painted[painted.length - 1]).toBe(3.5);
  });

  it("re-anchors on the first frame of each new follow", () => {
    // Between two follows a step may have carried the strip anywhere. An anchor
    // kept from the previous follow would replay that whole gap.
    liveOffset = 0;
    act(() => follow.startFollowing(false));
    visual.emit(frameAt(10));
    expect(offsetRef.current).toBe(10);

    follow.stopFollowing();
    liveOffset = 100;
    act(() => follow.startFollowing(false));
    visual.emit(frameAt(10.5));

    expect(offsetRef.current).toBe(100.5);
  });
});

describe("useOffsetFollow — the shared frame-drop rule", () => {
  /** Walks a ride and reports, per frame, whether the rule shed it and whether
   * a paint happened — asserted against the rule itself, at any tuning. */
  const ride = () =>
    Array.from(
      { length: FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1 },
      (_, index) => {
        const frame = frameAt(0.1 * (index + 1), {
          phase: "running",
          runningFrameIndex: index,
        });
        const before = painted.length;
        visual.emit(frame);
        return {
          dropped: isDroppedFallbackFrame(frame),
          paints: painted.length - before,
          offset: offsetRef.current,
          at: frame.pageOffset,
        };
      },
    );

  it("advances the offset on a dropped frame but does not paint it", () => {
    // What the rule sheds is the PAINT. Shedding the position with it would
    // leave the strip behind by every frame the rule ever dropped.
    act(() => follow.startFollowing(true));
    painted.length = 0;

    const seen = ride();

    expect(seen.some((frame) => frame.dropped)).toBe(true);
    for (const frame of seen) {
      expect(frame.paints).toBe(frame.dropped ? 0 : 1);
      // Checked on EVERY frame, not at the end of the ride: the next kept
      // frame recomputes the offset from the anchor anyway, so a ride read
      // only at its finish cannot tell the two apart. What a dropped frame
      // leaves behind matters because the consumer reads this offset the
      // moment a step begins — and a step may begin right after one.
      expect(frame.offset).toBeCloseTo(frame.at, 10);
    }
  });

  it("paints every frame while the finger is down", () => {
    // Drag frames are never shed: the rule is relief for a JS-driven ride, not
    // for a finger the user is watching.
    act(() => follow.startFollowing(false));
    painted.length = 0;

    for (const frame of ride()) expect(frame.paints).toBe(1);
  });

  it("switches flavour on a second plan without re-subscribing", () => {
    // A drag that releases into the no-WAAPI ride publishes `follow` twice and
    // does NOT restart the stream. Reading the flavour from the closure of the
    // first call would keep painting every frame while the track sheds every
    // Nth — the exact desync the shared rule exists to prevent.
    act(() => follow.startFollowing(false)); // finger down
    const takeOvers = journal.filter((entry) => entry === "take-over").length;

    act(() => follow.startFollowing(true)); // released, no compositor

    expect(visual.listenerCount()).toBe(1);
    expect(journal.filter((entry) => entry === "take-over")).toHaveLength(
      takeOvers,
    );

    painted.length = 0;
    const seen = ride();
    expect(seen.some((frame) => frame.dropped)).toBe(true);
    for (const frame of seen) expect(frame.paints).toBe(frame.dropped ? 0 : 1);
  });
});

describe("useOffsetFollow — letting go", () => {
  it("unsubscribes, and a later frame reaches nothing", () => {
    act(() => follow.startFollowing(false));
    expect(visual.listenerCount()).toBe(1);

    follow.stopFollowing();

    expect(visual.listenerCount()).toBe(0);
    painted.length = 0;
    visual.emit(frameAt(9));
    expect(painted).toEqual([]);
  });

  it("is safe to call when nothing is running", () => {
    expect(() => {
      follow.stopFollowing();
      follow.stopFollowing();
    }).not.toThrow();
  });
});
