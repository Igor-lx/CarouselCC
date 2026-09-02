// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useModuleRenderPolicy,
  type ModuleRenderPolicy,
} from "../useModuleRenderPolicy";

/**
 * The single place that decides whether a module renders — and it had no test
 * at all.
 *
 * It answers TWO questions that look alike and are not: `hasXSlot` is "did the
 * host wire this slot up", which diagnostics audits the host against, and
 * `slots.x` is "should it be on screen right now". Collapsing them either
 * silences a module the host did wire, or tells diagnostics the host forgot a
 * slot it actually passed.
 */

const CONTROLS = "controls-node";
const PAGINATION = "pagination-node";
const DIAGNOSTIC = "diagnostic-node";
const RESPONSIVE = "responsive-node";

interface Input {
  controlsSlot?: unknown;
  paginationSlot?: unknown;
  diagnosticSlot?: unknown;
  responsiveImagesSlot?: unknown;
  isControlsOn?: boolean;
  isPaginationOn?: boolean;
  canSlide?: boolean;
}

let host: HTMLDivElement;
let root: Root;
let policy: ModuleRenderPolicy;

// `??` would swallow an explicit `null`, and "the host wired nothing" is
// exactly the case under test — so absence is decided by the KEY, not the value.
const slotOr = (input: Input, key: keyof Input, fallback: string) =>
  (key in input ? input[key] : fallback) as never;

function Probe(input: Input) {
  policy = useModuleRenderPolicy({
    controlsSlot: slotOr(input, "controlsSlot", CONTROLS),
    paginationSlot: slotOr(input, "paginationSlot", PAGINATION),
    diagnosticSlot: slotOr(input, "diagnosticSlot", DIAGNOSTIC),
    responsiveImagesSlot: slotOr(input, "responsiveImagesSlot", RESPONSIVE),
    isControlsOn: input.isControlsOn ?? true,
    isPaginationOn: input.isPaginationOn ?? true,
    canSlide: input.canSlide ?? true,
  });
  return null;
}

const render = (input: Input = {}) => {
  act(() => {
    root.render(<Probe {...input} />);
  });
  return policy;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useModuleRenderPolicy — controls", () => {
  it("shows them when the host wired them, asked for them, and the deck can slide", () => {
    expect(render().slots.controls).toBe(CONTROLS);
  });

  it("silences them when the host did not ask for them", () => {
    const view = render({ isControlsOn: false });

    expect(view.slots.controls).toBeNull();
    // …but the wiring flag still says the host DID pass the slot, which is
    // what diagnostics audits. Collapsing the two would report the host as
    // having forgotten something it provided.
    expect(view.hasControlsSlot).toBe(true);
  });

  it("silences them on a deck with nowhere to go", () => {
    // Arrows on a deck that cannot slide are buttons that do nothing.
    const view = render({ canSlide: false });

    expect(view.slots.controls).toBeNull();
    expect(view.hasControlsSlot).toBe(true);
  });

  it("has nothing to show when the host wired nothing", () => {
    const view = render({ controlsSlot: null });

    expect(view.slots.controls).toBeNull();
    expect(view.hasControlsSlot).toBe(false);
  });
});

describe("useModuleRenderPolicy — pagination", () => {
  it("follows its own switch, not the controls' one", () => {
    // Two independent modules: a host may want dots without arrows.
    const view = render({ isControlsOn: false });

    expect(view.slots.controls).toBeNull();
    expect(view.slots.pagination).toBe(PAGINATION);
  });

  it("is silenced by its own switch and by a deck that cannot slide", () => {
    expect(render({ isPaginationOn: false }).slots.pagination).toBeNull();
    expect(render({ canSlide: false }).slots.pagination).toBeNull();
    expect(render({ paginationSlot: null }).hasPaginationSlot).toBe(false);
  });
});

describe("useModuleRenderPolicy — the modules the deck's state does not gate", () => {
  it("keeps responsive images on a deck that cannot slide", () => {
    // It is not a control: a single-slide deck still has a picture to pick.
    const view = render({ canSlide: false, isControlsOn: false });

    expect(view.slots.responsiveImages).toBe(RESPONSIVE);
    expect(view.hasResponsiveImagesSlot).toBe(true);
  });

  it("reports no responsive-images slot when the host wired none", () => {
    const view = render({ responsiveImagesSlot: null });

    expect(view.slots.responsiveImages).toBeNull();
    expect(view.hasResponsiveImagesSlot).toBe(false);
  });

  it("attaches diagnostics only when the host wired the slot", () => {
    // The other half of this gate — that it is dev-only — cannot be observed
    // here: the test build IS a dev build, so `IS_DEV` is true in both
    // branches. Recorded rather than asserted.
    expect(render().isDiagnosticActive).toBe(true);
    expect(render().slots.diagnostic).toBe(DIAGNOSTIC);

    const withoutSlot = render({ diagnosticSlot: null });
    expect(withoutSlot.isDiagnosticActive).toBe(false);
    expect(withoutSlot.slots.diagnostic).toBeNull();
    expect(withoutSlot.hasDiagnosticSlot).toBe(false);
  });
});

describe("useModuleRenderPolicy — the object it hands down", () => {
  it("stays identical across a render that changes nothing", () => {
    // It is spread into the carousel's tree; a fresh object per render would
    // re-render every gated module on every parent render.
    const first = render();
    expect(render()).toBe(first);
  });

  it("is rebuilt when a gate actually moves", () => {
    const first = render();
    expect(render({ canSlide: false })).not.toBe(first);
  });
});
