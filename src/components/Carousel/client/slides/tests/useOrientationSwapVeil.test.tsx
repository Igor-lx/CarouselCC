// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useOrientationSwapVeil } from "../useOrientationSwapVeil";

/**
 * The veil masks ONE repaint race: the slide box has flipped aspect but the
 * browser is still painting the old `<source media>` crop. It is raised on a
 * signature change and lifted when the new bitmap is decodable, with a
 * fail-open timer as the cap.
 *
 * What this pins: the effect guards on a signature ref BEFORE it checks whether
 * a bitmap is on screen. If `isBitmapShown` falls to false with the veil up (an
 * art-directed crop 404s right after a rotation, so the slide renders its alt
 * text instead), teardown kills the fail-open timer while the re-run returns
 * immediately on the unchanged signature — so `isVeiled` would stay true for
 * good, and a successful retry would remount the `<img>` under
 * `data-reorienting="true"`: opacity 0, an empty card until the next rotation.
 * Hence the veil is lowered in teardown.
 *
 * The second half of the hook — everything that LOWERS the veil — runs inside
 * a `requestAnimationFrame`, and until these tests nothing ever let that frame
 * run: 31 of this file's mutants had no coverage at all. A veil that goes up
 * and never comes down is an empty card until the next rotation, so the
 * lowering is the half that must not break.
 */

let host: HTMLDivElement;
let root: Root;
let veiled = false;
let img: HTMLImageElement | null = null;

const VEIL_MAX_MS = 2250;
const FRAME_MS = 16;

function Probe({
  isBitmapShown,
  viewportSignature,
  hasImg = true,
}: {
  isBitmapShown: boolean;
  viewportSignature: string;
  hasImg?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  veiled = useOrientationSwapVeil({ imgRef, isBitmapShown, viewportSignature });
  // `hasImg` is deliberately NOT an effect dependency: dropping the node has
  // to empty the ref without re-running the veil effect, which is exactly the
  // production case — the slide swaps to its alt text while a frame is due.
  return hasImg ? (
    <img
      ref={(node) => {
        imgRef.current = node;
        img = node;
      }}
      alt=""
    />
  ) : null;
}

const render = (
  isBitmapShown: boolean,
  viewportSignature: string,
  hasImg = true,
) =>
  act(() => {
    root.render(
      <Probe
        isBitmapShown={isBitmapShown}
        viewportSignature={viewportSignature}
        hasImg={hasImg}
      />,
    );
  });

/** Let the effect's `requestAnimationFrame` body run. */
const frame = () =>
  act(() => {
    vi.advanceTimersByTime(FRAME_MS);
  });

/** Flush a settled `decode()` promise. */
const settleDecode = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Replace the element's `decode`, or remove it entirely. */
const withDecode = (impl: (() => Promise<void>) | undefined) => {
  Object.defineProperty(img as HTMLImageElement, "decode", {
    configurable: true,
    value: impl,
  });
};

const setComplete = (value: boolean) => {
  Object.defineProperty(img as HTMLImageElement, "complete", {
    configurable: true,
    value,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  img = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  veiled = false;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useOrientationSwapVeil", () => {
  it("stays down while the signature holds", () => {
    render(true, "0110");
    expect(veiled).toBe(false);
  });

  it("raises on a signature change while a bitmap is shown", () => {
    render(true, "0110");
    render(true, "1010");
    expect(veiled).toBe(true);
  });

  it("does not raise when there is no bitmap to mask", () => {
    render(false, "0110");
    render(false, "1010");
    expect(veiled).toBe(false);
  });

  it("comes down when the bitmap disappears mid-veil", () => {
    render(true, "0110");
    render(true, "1010");
    expect(veiled).toBe(true);

    // The crop failed: the slide swaps to its alt text, so nothing is masked.
    render(false, "1010");
    expect(veiled).toBe(false);

    // …and the retry that brings the image back must not find it hidden.
    render(true, "1010");
    expect(veiled).toBe(false);
  });

  it("comes down when the veil's own effect is torn down", () => {
    render(true, "0110");
    render(true, "1010");
    expect(veiled).toBe(true);

    act(() => root.unmount());
    root = createRoot(host);
    render(true, "1010");
    expect(veiled).toBe(false);
  });
});

describe("useOrientationSwapVeil — how the veil comes down", () => {
  /** Rotate with a bitmap on screen: the veil goes up and the frame is due. */
  const rotate = () => {
    render(true, "0110");
    render(true, "1010");
    expect(veiled).toBe(true);
  };

  it("lifts once the new crop has decoded", () => {
    rotate();
    // `complete` is false so the no-decode fallback would NOT clear on its
    // own: what lowers the veil here can only be `decode()`.
    setComplete(false);
    withDecode(() => Promise.resolve());
    frame();
    return settleDecode().then(() => {
      expect(veiled).toBe(false);
    });
  });

  it("lifts even when decoding FAILS", () => {
    // An honest, if broken, image beats a card that is masked for good: the
    // rejection handler is the same `clear`, not a different path.
    rotate();
    setComplete(false);
    withDecode(() => Promise.reject(new Error("undecodable")));
    frame();
    return settleDecode().then(() => {
      expect(veiled).toBe(false);
    });
  });

  it("lifts at once on a browser without decode when the image is already there", () => {
    rotate();
    withDecode(undefined);
    setComplete(true);
    frame();

    expect(veiled).toBe(false);
  });

  it("waits for the load event when the image is still coming", () => {
    rotate();
    withDecode(undefined);
    setComplete(false);
    frame();
    expect(veiled).toBe(true);

    act(() => {
      (img as HTMLImageElement).dispatchEvent(new Event("load"));
    });
    expect(veiled).toBe(false);
  });

  it("lifts on an error just as it does on a load", () => {
    rotate();
    withDecode(undefined);
    setComplete(false);
    frame();
    expect(veiled).toBe(true);

    act(() => {
      (img as HTMLImageElement).dispatchEvent(new Event("error"));
    });
    expect(veiled).toBe(false);
  });

  it("gives up on its own past the cap", () => {
    // The fail-open timer is the only thing standing between a bitmap that
    // never resolves and a permanently blank slide.
    rotate();
    withDecode(undefined);
    setComplete(false);
    frame();
    expect(veiled).toBe(true);

    // The cap is measured from the effect, and `frame()` has already spent
    // FRAME_MS of it — counting from here instead would step over the edge and
    // pass whatever the timer did.
    act(() => {
      vi.advanceTimersByTime(VEIL_MAX_MS - FRAME_MS - 1);
    });
    expect(veiled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(veiled).toBe(false);
  });

  it("lifts when the image is gone by the time the frame runs", () => {
    // The slide swaps to its alt text between the rotation and the frame: the
    // node unmounts, React empties the ref, and the veil has nothing left to
    // wait for. Reading the missing element instead would throw inside a
    // `requestAnimationFrame` callback, where nothing catches it — and the
    // veil would stay up until the next rotation.
    rotate();
    render(true, "1010", false);
    expect(veiled).toBe(true); // still up: the effect did not re-run

    frame();
    expect(veiled).toBe(false);
  });

  it("detaches its load listeners when the effect is torn down", () => {
    // The listeners are `once`, but a teardown before either fires would leave
    // them on an element the hook no longer owns — and `clear` would then set
    // state on an unmounted tree.
    rotate();
    withDecode(undefined);
    setComplete(false);
    frame();
    const element = img as HTMLImageElement;

    act(() => root.unmount());
    root = createRoot(host);

    expect(() => {
      element.dispatchEvent(new Event("load"));
    }).not.toThrow();
  });
});
