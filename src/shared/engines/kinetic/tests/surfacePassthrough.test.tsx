// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useKineticValue } from "../useKineticValue";

/**
 * The blank's own quick start puts a control INSIDE the host:
 *
 *   <div {...kinetic.hostProps}>
 *     <div ref={kinetic.ref} />
 *     <button onClick={…}>→</button>
 *   </div>
 *
 * By default the whole host owns the finger, so holding that button would
 * brake a flying value. `surfaceRef` declares what is actually draggable;
 * everything else under the host becomes chrome and is left alone.
 */

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({
    startTime: null,
    cancel: vi.fn(),
    onfinish: null,
    oncancel: null,
  })) as unknown as typeof Element.prototype.animate;
});

let host: HTMLDivElement;
let root: Root;

const pointerEvent = (
  type: string,
  { x, y, t }: { x: number; y: number; t?: number },
) => {
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

const send = (
  el: Element,
  type: string,
  point: { x: number; y: number; t?: number },
) =>
  act(() => {
    el.dispatchEvent(pointerEvent(type, point));
  });

const KEYFRAME = (x: number) => ({ transform: `translateX(${x}px)` });

/** Surface = the moving element; the button beside it is chrome. */
const Probe = ({ withSurface }: { withSurface: boolean }) => {
  const circleRef = useRef<HTMLElement | null>(null);
  const kinetic = useKineticValue({
    keyframe: KEYFRAME,
    initialValue: 0,
    ...(withSurface ? { surfaceRef: circleRef } : {}),
  });

  return (
    <div {...kinetic.hostProps} data-host>
      <div
        ref={(node) => {
          kinetic.ref(node);
          circleRef.current = node;
        }}
        data-circle
      />
      <button data-arrow>→</button>
    </div>
  );
};

const el = (attr: string): HTMLElement =>
  host.querySelector(`[${attr}]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("surfaceRef passthrough", () => {
  it("without it, a drag started on the chrome button still moves the value", () => {
    act(() => root.render(<Probe withSurface={false} />));
    send(el("data-arrow"), "pointerdown", { x: 0, y: 0, t: 0 });
    send(el("data-arrow"), "pointermove", { x: 60, y: 0, t: 16 });
    send(el("data-arrow"), "pointermove", { x: 120, y: 0, t: 32 });
    expect(el("data-circle").style.transform).not.toBe("translateX(0px)");
  });

  it("with it, the chrome button leaves the value untouched", () => {
    act(() => root.render(<Probe withSurface />));
    send(el("data-arrow"), "pointerdown", { x: 0, y: 0, t: 0 });
    send(el("data-arrow"), "pointermove", { x: 60, y: 0, t: 16 });
    send(el("data-arrow"), "pointermove", { x: 120, y: 0, t: 32 });
    expect(el("data-circle").style.transform).toBe("translateX(0px)");
  });

  it("with it, a held press on the chrome takes no ownership at all", () => {
    act(() => root.render(<Probe withSurface />));
    send(el("data-arrow"), "pointerdown", { x: 0, y: 0, t: 0 });
    act(() => {
      vi.advanceTimersByTime(1000); // outlast the catch window
    });
    expect(el("data-circle").style.transform).toBe("translateX(0px)");
  });

  it("dragging the surface itself still works", () => {
    act(() => root.render(<Probe withSurface />));
    send(el("data-circle"), "pointerdown", { x: 0, y: 0, t: 0 });
    send(el("data-circle"), "pointermove", { x: 60, y: 0, t: 16 });
    send(el("data-circle"), "pointermove", { x: 120, y: 0, t: 32 });
    expect(el("data-circle").style.transform).not.toBe("translateX(0px)");
  });
});
