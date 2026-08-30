// See ../README.md
import { describe, expect, it } from "vitest";

import type { Slide } from "../../client/public-api/types";
import type { GeneratedSlide } from "../../data-gen/types";

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
