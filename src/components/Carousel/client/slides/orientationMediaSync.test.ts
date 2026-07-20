import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SLIDE_CANONICAL_SOURCE_MEDIA,
  SLIDE_VIEWPORT_BREAKPOINTS,
} from "../config";
import {
  breakpointMinWidthQuery,
  sortedBreakpointEntries,
} from "../../../../shared";

/**
 * SSOT guard for the viewport-axes contract (config/viewport.ts). The axes
 * table is the single source: canonical media strings derive from its
 * NUMBERS, art-directed slide data must use ONLY those strings, and the
 * component stylesheet must carry no media conditions at all (geometry keys
 * on the root's data attributes instead). Which crop family sits behind
 * which condition is the dataset's tuning — this guard pins only the
 * CONDITIONS. Diagnostics repeats the data audit at runtime for arbitrary
 * hosts; this test covers the repo's own generator configs in CI.
 */

const read = (relativeToRepoRoot: string) =>
  readFileSync(resolve(__dirname, "../../../../..", relativeToRepoRoot), "utf8");

describe("viewport axes SSOT", () => {
  it("canonical strings derive from the breakpoint table numbers", () => {
    for (const [, px] of sortedBreakpointEntries(SLIDE_VIEWPORT_BREAKPOINTS)) {
      if (px > 0) {
        expect(SLIDE_CANONICAL_SOURCE_MEDIA).toContain(
          breakpointMinWidthQuery(px),
        );
      }
    }
    // The fallback tier must NOT produce a source condition: a 0-width
    // min-width always matches and would shadow the default set.
    expect(SLIDE_CANONICAL_SOURCE_MEDIA).not.toContain(
      breakpointMinWidthQuery(0),
    );
  });

  it("every <source media> in the generator configs is canonical", () => {
    for (const config of ["carousel-data.config1.json", "carousel-data.config2.json"]) {
      const text = JSON.stringify(JSON.parse(read(config)));
      const mediaValues = [...text.matchAll(/"media":"([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(mediaValues.length).toBeGreaterThan(0);
      for (const media of mediaValues) {
        expect(SLIDE_CANONICAL_SOURCE_MEDIA).toContain(media);
      }
    }
  });

  it("the component stylesheet carries no media queries for slide geometry", () => {
    const scss = read("src/components/Carousel/client/Carousel.module.scss");
    for (const block of scss.split("@media").slice(1)) {
      const body = block.slice(0, block.indexOf("}"));
      expect(body).not.toContain("--slide-aspect");
      expect(body).not.toContain("--slide-height");
    }
  });

  it("the demo App carries no slide-geometry styling (self-sufficiency)", () => {
    const hostScss = read("src/app/App.module.scss");
    expect(hostScss).not.toContain("--slide-aspect");
    expect(hostScss).not.toContain("--slide-height");
  });
});
