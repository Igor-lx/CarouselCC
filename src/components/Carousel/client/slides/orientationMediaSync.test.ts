import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SLIDE_ART_DIRECTION_MEDIA_CONDITION } from "../config";

/**
 * SSOT guard for the art-direction flip. One media condition flips three
 * things at once — the DEMO HOST's slide box aspect (App.module.scss: the
 * component itself ships no geometry media queries, the host tunes the CSS
 * variables), the art-directed `<source>` crop (generated data), and the
 * reorientation veil (the TS constant). If any copy drifts, the box, the
 * asset and the veil react to DIFFERENT flips and the swap silently breaks.
 * Same pattern as `themeBootSync.test.ts`: read the real files, assert the
 * same string. Which crop family sits on which side of the condition is the
 * dataset's tuning — this guard pins only the CONDITION.
 */

const read = (relativeToRepoRoot: string) =>
  readFileSync(resolve(__dirname, "../../../../..", relativeToRepoRoot), "utf8");

describe("slide orientation media condition SSOT", () => {
  it("the TS constant is the canonical condition", () => {
    expect(SLIDE_ART_DIRECTION_MEDIA_CONDITION).toBe(
      "(orientation: landscape) and (max-height: 520px)",
    );
  });

  it("the demo host's aspect override uses the same condition", () => {
    const hostScss = read("src/app/App.module.scss");
    expect(hostScss).toContain(`@media ${SLIDE_ART_DIRECTION_MEDIA_CONDITION}`);
  });

  it("the component ships no geometry media queries of its own", () => {
    const scss = read("src/components/Carousel/client/Carousel.module.scss");
    // Every @media block in the component stylesheet must be about layout
    // ergonomics, never about --slide-aspect / --slide-height: per-viewport
    // slide shaping is host tuning by design.
    for (const block of scss.split("@media").slice(1)) {
      const body = block.slice(0, block.indexOf("}"));
      expect(body).not.toContain("--slide-aspect");
      expect(body).not.toContain("--slide-height");
    }
  });

  it("every generated wide <source> uses the same condition", () => {
    for (const config of ["carousel-data.config1.json", "carousel-data.config2.json"]) {
      const parsed = JSON.parse(read(config)) as {
        sources?: Array<{ media?: string }>;
      } & Record<string, unknown>;
      const text = JSON.stringify(parsed);
      // Each config declares at least one wide-crop source, and no source
      // spells the orientation condition differently.
      expect(text).toContain(SLIDE_ART_DIRECTION_MEDIA_CONDITION);
      const mediaValues = [...text.matchAll(/"media":"([^"]+)"/g)].map((m) => m[1]);
      for (const media of mediaValues) {
        if (media.includes("orientation")) {
          expect(media).toBe(SLIDE_ART_DIRECTION_MEDIA_CONDITION);
        }
      }
    }
  });
});
