// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../../../config";
import type {
  CarouselMotionPlan,
  MotionPlanChannel,
  MotionPlanSource,
} from "../../../../motion";
import {
  isDroppedFallbackFrame,
  type VisualPositionFrame,
  type VisualPositionSource,
} from "../../../../visual-position";
import { buildPaginationWidgetGeometry } from "../math/spatialField";
import { PAGINATION_WIDGET_DEFAULTS } from "../defaults";
import { usePaginationWidgetBinding } from "../usePaginationWidgetBinding";

/**
 * Follow mode's pacing contract. The runner publishes `follow` twice on a
 * no-WAAPI device вЂ” once for the finger, once for the ride it releases into вЂ”
 * and the second plan does NOT restart the subscription. A binding that read
 * its flavour from the first plan's closure would keep painting every frame
 * while the track skips every Nth, which is exactly the desync the shared rule
 * exists to prevent.
 */

type PublishablePlan = Parameters<MotionPlanChannel["publish"]>[0];

const createPlanChannel = () => {
  const listeners = new Set<(plan: CarouselMotionPlan) => void>();
  let current: CarouselMotionPlan = { kind: "idle", planId: 0 };
  let nextId = 1;
  const source: MotionPlanSource = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    publish(plan: PublishablePlan) {
      current = { ...plan, planId: nextId } as CarouselMotionPlan;
      nextId += 1;
      const published = current;
      act(() => {
        listeners.forEach((listener) => listener(published));
      });
    },
  };
};

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
let plan: ReturnType<typeof createPlanChannel>;
let visual: ReturnType<typeof createVisualPosition>;

function Probe() {
  const geometry = useMemo(
    () =>
      buildPaginationWidgetGeometry(PAGINATION_WIDGET_DEFAULTS.visibleDots, {
        size: PAGINATION_WIDGET_DEFAULTS.dotSize,
        gap: PAGINATION_WIDGET_DEFAULTS.dotGap,
        scaleFactor: PAGINATION_WIDGET_DEFAULTS.scaleFactor,
      }),
    [],
  );
  const { bindDotRef, slotCount } = usePaginationWidgetBinding({
    visualPosition: visual.source,
    motionPlan: plan.source,
    geometry,
  });
  return (
    <>
      {Array.from({ length: slotCount }, (_, index) => (
        <div key={index} ref={bindDotRef(index)} data-slot={index} />
      ))}
    </>
  );
}

/** The whole strip's painted state вЂ” a frame either moves it or it does not. */
const paintedStrip = () =>
  [...host.querySelectorAll<HTMLElement>("[data-slot]")]
    .map((dot) => `${dot.style.transform}@${dot.style.opacity}`)
    .join("|");

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  plan = createPlanChannel();
  visual = createVisualPosition();
  act(() => {
    root.render(<Probe />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/**
 * Walks a fallback ride and asserts the strip against the rule itself rather
 * than against a frame count: a dropped frame must leave the paint untouched, a
 * kept one must move it вЂ” at ANY tuning of the rule.
 */
const expectTheSharedDropRule = () => {
  let painted = paintedStrip();
  for (let index = 0; index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1; index += 1) {
    const frame = frameAt(0.1 * (index + 1), {
      phase: "running",
      runningFrameIndex: index,
    });
    visual.emit(frame);

    if (isDroppedFallbackFrame(frame)) expect(paintedStrip()).toBe(painted);
    else expect(paintedStrip()).not.toBe(painted);
    painted = paintedStrip();
  }
};

describe("usePaginationWidgetBinding вЂ” follow pacing", () => {
  it("drops exactly the frames the track drops on a fallback ride", () => {
    plan.publish({ kind: "follow", isFallback: true });
    expectTheSharedDropRule();
  });

  it("switches to the dropping rule when a drag releases into the fallback ride", () => {
    plan.publish({ kind: "follow", isFallback: false }); // finger down
    plan.publish({ kind: "follow", isFallback: true }); // released, no compositor
    expectTheSharedDropRule();
  });

  it("paints every frame while the finger is down", () => {
    plan.publish({ kind: "follow", isFallback: false });

    let painted = paintedStrip();
    for (let index = 0; index < FALLBACK_DROP_EVERY_NTH_FRAME * 2 + 1; index += 1) {
      visual.emit(
        frameAt(0.1 * (index + 1), { phase: "running", runningFrameIndex: index }),
      );
      expect(paintedStrip()).not.toBe(painted);
      painted = paintedStrip();
    }
  });
});
