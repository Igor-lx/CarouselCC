import { describe, expect, it } from "vitest";

import type { Slide } from "../components/Carousel";
import {
  generateCarouselSlides,
  slugFromUrl,
  type GenerateCarouselSlidesInput,
} from "./carouselContentGen";

// URL basenames match the slug keys — exactly as the real script produces them
// (both derive from the same filename), so the slug-based merge lines up.
const widths: GenerateCarouselSlidesInput["widths"] = [
  {
    width: 480,
    urlBySlug: {
      carousel1: "/p/480/carousel1.webp",
      carousel2: "/p/480/carousel2.webp",
    },
  },
  {
    width: 720,
    urlBySlug: {
      carousel1: "/p/720/carousel1.webp",
      carousel2: "/p/720/carousel2.webp",
    },
  },
];

const sources: GenerateCarouselSlidesInput["sources"] = [
  {
    media: "(orientation: landscape)",
    type: "image/webp",
    // Only carousel1 has a landscape crop.
    widths: [
      { width: 480, urlBySlug: { carousel1: "/l/480/carousel1.webp" } },
      { width: 720, urlBySlug: { carousel1: "/l/720/carousel1.webp" } },
    ],
  },
];

const baseInput: GenerateCarouselSlidesInput = {
  widths,
  sources,
  slugs: ["carousel1", "carousel2"],
  newId: (slug) => `id-${slug}`,
};

describe("slugFromUrl", () => {
  it("extracts the filename slug from a URL", () => {
    expect(slugFromUrl("/CarouselCC/carousel/portrait/480/carousel7.webp")).toBe(
      "carousel7",
    );
    expect(slugFromUrl("carousel3.webp")).toBe("carousel3");
  });
});

describe("generateCarouselSlides", () => {
  it("shapes slides: smallest = content, full srcSet, crop source, scaffold alt", () => {
    const [first, second] = generateCarouselSlides(baseInput);

    expect(first).toEqual({
      id: "id-carousel1",
      content: "/p/480/carousel1.webp", // smallest candidate = canonical fallback
      alt: "",
      image: {
        srcSet: "/p/480/carousel1.webp 480w, /p/720/carousel1.webp 720w",
        sources: [
          {
            media: "(orientation: landscape)",
            srcSet: "/l/480/carousel1.webp 480w, /l/720/carousel1.webp 720w",
            type: "image/webp",
          },
        ],
      },
    });

    // carousel2 has no landscape crop -> no sources key.
    expect(second?.content).toBe("/p/480/carousel2.webp");
    expect(second?.image && "sources" in second.image).toBe(false);
  });

  it("defaults a new slide's id to its slug when no minter is given", () => {
    const [first] = generateCarouselSlides({ ...baseInput, newId: undefined });
    expect(first?.id).toBe("carousel1");
  });

  it("preserves id and hand-written alt for existing slides on regeneration", () => {
    const previous: Slide[] = [
      {
        id: "stable-uuid-1",
        content: "/p/480/carousel1.webp", // slug "carousel1" -> matches
        alt: "A hand-written description",
        image: { srcSet: "/p/480/carousel1.webp 480w" },
      },
    ];
    const [first, second] = generateCarouselSlides({ ...baseInput, previous });

    // carousel1 matches the previous entry by slug -> id + alt preserved.
    expect(first?.id).toBe("stable-uuid-1");
    expect(first?.alt).toBe("A hand-written description");
    // carousel2 is new -> freshly minted id, scaffold alt.
    expect(second?.id).toBe("id-carousel2");
    expect(second?.alt).toBe("");
  });

  it("drops slides whose asset no longer exists", () => {
    // `previous` carries a slide whose slug is not in the new `slugs`.
    const previous: Slide[] = [
      {
        id: "gone",
        content: "/p/480/carousel9.webp",
        image: { srcSet: "/p/480/carousel9.webp 480w" },
      },
    ];
    const slugs = generateCarouselSlides({ ...baseInput, previous }).map(
      (slide) => slugFromUrl(String(slide.content)),
    );
    expect(slugs).toEqual(["carousel1", "carousel2"]);
    expect(slugs).not.toContain("carousel9");
  });
});
