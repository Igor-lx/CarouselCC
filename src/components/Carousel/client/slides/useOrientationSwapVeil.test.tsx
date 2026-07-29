// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useOrientationSwapVeil } from "./useOrientationSwapVeil";

/**
 * The veil masks ONE repaint race: the slide box has flipped aspect but the
 * browser is still painting the old `<source media>` crop. It is raised on a
 * signature change and lifted when the new bitmap is decodable, with a
 * fail-open timer as the cap.
 *
 * The regression this pins: the effect guards on a signature ref BEFORE it
 * checks whether a bitmap is on screen. When `isBitmapShown` fell to false with
 * the veil up (an art-directed crop 404s right after a rotation, so the slide
 * renders its alt text instead), teardown killed the fail-open timer and the
 * re-run returned immediately on the unchanged signature. `isVeiled` stayed
 * true for good, and once the retry succeeded the remounted `<img>` came back
 * under `data-reorienting="true"` — opacity: 0, an empty card until the user
 * rotated the device again.
 */

let host: HTMLDivElement;
let root: Root;
let veiled = false;

function Probe({
  isBitmapShown,
  viewportSignature,
}: {
  isBitmapShown: boolean;
  viewportSignature: string;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  veiled = useOrientationSwapVeil({ imgRef, isBitmapShown, viewportSignature });
  return <img ref={imgRef} alt="" />;
}

const render = (isBitmapShown: boolean, viewportSignature: string) =>
  act(() => {
    root.render(
      <Probe
        isBitmapShown={isBitmapShown}
        viewportSignature={viewportSignature}
      />,
    );
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  veiled = false;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
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
