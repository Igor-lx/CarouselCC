// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import Carousel from "../../../Carousel";
import { Diagnostic } from "..";
import type { CarouselProps, Slide } from "../../../public-api/types";
import { installCarouselBrowserEnv } from "../../../tests/browserEnv";

/**
 * The dev slot, mounted for real — which is the only way to reach it at all.
 *
 * Its promise is a pair, and each half is worthless without the other: a bad
 * input reaches the deck UNREPAIRED (ADR-002), and the developer is TOLD. Drop
 * the first half and the component starts quietly disagreeing with the numbers
 * its host handed it; drop the second and a host debugging a broken deck has
 * nothing to go on but the deck.
 *
 * Asserted through `console.warn` because that is the whole output surface —
 * the component renders `null` by design.
 */

const slides = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    content: `slide ${i}`,
  }));

let host: HTMLDivElement;
let root: Root;
let warn: MockInstance<typeof console.warn>;

const render = (props: Partial<CarouselProps> = {}) => {
  act(() => {
    root.render(
      <Carousel
        slidesData={slides(12)}
        visibleSlidesNr={3}
        isContentImg={false}
        isAutoplayOn={false}
        {...props}
      >
        <Diagnostic />
      </Carousel>,
    );
  });
};

/** Every line the slot printed, joined — the order between checks is not a contract. */
const reported = () =>
  warn.mock.calls.map((call) => String(call[0])).join("\n");

const slideNodes = () =>
  Array.from(host.querySelectorAll("[data-active-zone]"));

beforeEach(() => {
  installCarouselBrowserEnv();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("<Diagnostic /> — observes, and never repairs", () => {
  it("names the layer, the field, the value and how loud it is", () => {
    render({ visibleSlidesNr: -1 });
    // Structure, never wording. Severity, layer, field and the value are what
    // a reader acts on and what the line must not lose; the prose around them
    // is reworded freely and is pinned nowhere on purpose (08-tests, § E).
    // A claim about the message CONTENT belongs to the collector's own test,
    // against the warning object — see checks/tests/propChecks.test.ts.
    expect(reported()).toContain("[CRITICAL] Props -> visibleSlidesNr");
    expect(reported()).toContain("has value -1");
  });

  it("lets the bad value through to the deck, unrepaired", () => {
    // The other half of ADR-002. A slot that quietly clamped `-1` to `1` would
    // make the warning a lie and hide the host's bug behind a working carousel.
    render({ visibleSlidesNr: -1 });
    expect(slideNodes()).toHaveLength(0);
  });

  it("stays silent on a deck whose props are all sound", () => {
    // A channel that always says something is a channel nobody reads.
    render({ visibleSlidesNr: 3 });
    expect(reported()).not.toContain("visibleSlidesNr");
  });
});
