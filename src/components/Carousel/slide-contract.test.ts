import { describe, expect, it } from "vitest";

import type { Slide } from "./client/contract/types";
import type { GeneratedSlide } from "./data-gen/types";

/**
 * Contract test — locks the seam between the two halves: the slide the
 * `data-gen/` kit EMITS must be a valid component `Slide`. The two types are
 * deliberately defined independently (so the halves stay decoupled), so this is
 * the one place that asserts they stay compatible.
 *
 * The guarantee is at compile time: the `const asSlide: Slide = generated`
 * assignment below fails `tsc` if `GeneratedSlide` ever drifts out of `Slide`
 * (a renamed field, a widened type). Lives at the box root (neutral ground), so
 * importing both halves' types does not cross the runtime boundary.
 */
describe("Slide contract (data-gen → client)", () => {
  it("a generated slide is assignable to the component Slide", () => {
    const generated: GeneratedSlide = {
      id: "carousel1",
      content: "/carousel/portrait/480/carousel1.webp",
      alt: "",
      image: {
        srcSet:
          "/carousel/portrait/480/carousel1.webp 480w, /carousel/portrait/720/carousel1.webp 720w",
        sources: [
          {
            media: "(orientation: landscape) and (max-height: 520px)",
            srcSet: "/carousel/landscape/480/carousel1.webp 480w",
            type: "image/webp",
          },
        ],
      },
    };

    // Compile-time contract check (tsc fails here on drift):
    const asSlide: Slide = generated;

    expect(asSlide.id).toBe("carousel1");
    expect(asSlide.content).toBe("/carousel/portrait/480/carousel1.webp");
  });
});
