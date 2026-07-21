// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePointerSwipe } from "../swipe/usePointerSwipe";

/**
 * The SURFACE contract: when a host declares its draggable surface, only
 * presses inside it are the engine's business. Chrome layered over the deck
 * INSIDE the host (arrows, overlays) must leave a running ride untouched —
 * no ownership, no brake, no drag — exactly like an element outside the host.
 *
 * This is a positive declaration, not an exception list: anything added
 * inside the host but outside the surface is excluded automatically.
 */

let container: HTMLDivElement;
let root: Root;

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
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const press = (el: Element, point: { x: number; y: number; t?: number }) =>
  act(() => {
    el.dispatchEvent(pointerEvent("pointerdown", point));
  });

const move = (el: Element, point: { x: number; y: number; t?: number }) =>
  act(() => {
    el.dispatchEvent(pointerEvent("pointermove", point));
  });

const lift = (el: Element, point: { x: number; y: number; t?: number }) =>
  act(() => {
    el.dispatchEvent(pointerEvent("pointerup", point));
  });

interface Seen {
  presses: number;
  dragStarts: number;
  releases: number;
}

const seen: Seen = { presses: 0, dragStarts: 0, releases: 0 };

/** Host = viewport; surface = the track; a button is chrome INSIDE the host. */
function Rig() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { hostProps } = usePointerSwipe({
    surfaceRef: trackRef,
    onPressStart: () => {
      seen.presses += 1;
    },
    onDragStart: () => {
      seen.dragStarts += 1;
    },
    onRelease: () => {
      seen.releases += 1;
    },
  });

  return (
    <div {...hostProps} data-testid="host">
      <div ref={trackRef} data-testid="track">
        <button data-testid="slide-button">slide</button>
      </div>
      <button data-testid="arrow">next</button>
    </div>
  );
}

const el = (testid: string): HTMLElement =>
  container.querySelector(`[data-testid="${testid}"]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  seen.presses = 0;
  seen.dragStarts = 0;
  seen.releases = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Rig />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("declared surface", () => {
  it("a held press on chrome inside the host never takes ownership", () => {
    press(el("arrow"), { x: 10, y: 10, t: 0 });
    // Outlast the catch window — on the surface this is exactly what brakes.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.presses).toBe(0);

    lift(el("arrow"), { x: 10, y: 10, t: 1100 });
    expect(seen.releases).toBe(0);
  });

  it("chrome cannot start a drag either", () => {
    press(el("arrow"), { x: 10, y: 10, t: 0 });
    move(el("arrow"), { x: 200, y: 10, t: 16 });
    move(el("arrow"), { x: 300, y: 10, t: 32 });
    lift(el("arrow"), { x: 300, y: 10, t: 48 });
    expect(seen.dragStarts).toBe(0);
    expect(seen.releases).toBe(0);
  });

  it("a held press ON the surface still takes ownership (the brake)", () => {
    press(el("track"), { x: 10, y: 10, t: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.presses).toBe(1);
  });

  it("an INTERACTIVE element inside the surface is still surface", () => {
    // A slide is a <button> when the deck is interactive — pressing it must
    // brake the deck, so interactivity must NOT be the exclusion axis.
    press(el("slide-button"), { x: 10, y: 10, t: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.presses).toBe(1);
  });

  it("a horizontal drag from the surface still activates", () => {
    press(el("track"), { x: 10, y: 10, t: 0 });
    move(el("track"), { x: 60, y: 12, t: 16 });
    move(el("track"), { x: 120, y: 12, t: 32 });
    expect(seen.dragStarts).toBe(1);
    lift(el("track"), { x: 120, y: 12, t: 48 });
    expect(seen.releases).toBe(1);
  });
});

/**
 * The point-exception marker: `data-drag-ignore="true"` states that an
 * element is not part of the draggable surface even though it sits inside
 * it — for the odd control on a card. Its click keeps working.
 */
function IgnoreRig() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { hostProps } = usePointerSwipe({
    surfaceRef: trackRef,
    onPressStart: () => {
      seen.presses += 1;
    },
    onDragStart: () => {
      seen.dragStarts += 1;
    },
    onRelease: () => {
      seen.releases += 1;
    },
  });

  return (
    <div {...hostProps}>
      <div ref={trackRef} data-testid="track2">
        <button data-testid="like" data-drag-ignore="true">
          like
        </button>
      </div>
    </div>
  );
}

describe("data-drag-ignore inside the surface", () => {
  beforeEach(() => {
    act(() => root.render(<IgnoreRig />));
  });

  it("takes no ownership on a held press", () => {
    press(el("like"), { x: 10, y: 10, t: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.presses).toBe(0);
  });

  it("starts no drag", () => {
    press(el("like"), { x: 10, y: 10, t: 0 });
    move(el("like"), { x: 200, y: 10, t: 16 });
    move(el("like"), { x: 300, y: 10, t: 32 });
    expect(seen.dragStarts).toBe(0);
  });

  it("the rest of the surface is unaffected", () => {
    press(el("track2"), { x: 10, y: 10, t: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.presses).toBe(1);
  });
});
