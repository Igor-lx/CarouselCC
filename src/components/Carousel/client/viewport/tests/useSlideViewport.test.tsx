// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installMatchMedia } from "../../tests/browserEnv";
import {
  SLIDE_VIEWPORT_BREAKPOINTS,
  SLIDE_VIEWPORT_FLAGS,
} from "../../config/viewport";
import { useSlideViewport } from "../useSlideViewport";
import type { MediaState } from "../../../../../shared";

/**
 * The carousel's viewport sensor is one line — and that line is the whole
 * point: it feeds THESE axes into the media facade, and every consumer reads
 * tier names and flag names that come from nowhere else.
 *
 * Asserted by the NAMES, not by the shape. "Returns a MediaState" would stay
 * green with any axes at all, including empty ones — the state's shape does not
 * depend on what was fed in. The flag keys and the tier set do, so swapping the
 * axes source turns this red, which is the only failure worth catching here.
 */

let host: HTMLDivElement;
let root: Root;
let seen: MediaState | null = null;

const Probe = () => {
  seen = useSlideViewport();
  return null;
};

beforeEach(() => {
  installMatchMedia(false);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  seen = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

it("feeds the carousel's own axes into the media facade", () => {
  act(() => {
    root.render(<Probe />);
  });

  expect(seen).not.toBeNull();
  expect(Object.keys(seen!.flags)).toEqual(Object.keys(SLIDE_VIEWPORT_FLAGS));
  expect(Object.keys(SLIDE_VIEWPORT_BREAKPOINTS)).toContain(seen!.breakpoint);
});
