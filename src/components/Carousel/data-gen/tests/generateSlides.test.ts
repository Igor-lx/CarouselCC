import { describe, expect, it } from "vitest";

import {
  generateSlides,
  slugFromUrl,
  type GenerateSlidesInput,
} from "../generateSlides";
import type { GeneratedSlide } from "../types";

// URL basenames match the slug keys вЂ” exactly as the runner produces them
// (both derive from the same filename), so the slug-based merge lines up.
const widths: GenerateSlidesInput["widths"] = [
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

const sources: GenerateSlidesInput["sources"] = [
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

const baseInput: GenerateSlidesInput = {
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

describe("generateSlides", () => {
  it("shapes slides: smallest = content, full srcSet, crop source, scaffold alt", () => {
    const [first, second] = generateSlides(baseInput);

    expect(first).toEqual({
      id: "id-carousel1",
      content: "/p/480/carousel1.webp",
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
    const [first] = generateSlides({ ...baseInput, newId: undefined });
    expect(first?.id).toBe("carousel1");
  });

  it("emits image.defaultSrc from the designated-default map, per slug", () => {
    const [first, second] = generateSlides({
      ...baseInput,
      defaultUrlBySlug: {
        carousel1: "/l/720/carousel1.webp",
        carousel2: "/p/720/carousel2.webp",
      },
    });
    expect(first?.image?.defaultSrc).toBe("/l/720/carousel1.webp");
    expect(second?.image?.defaultSrc).toBe("/p/720/carousel2.webp");
  });

  it("omits defaultSrc when no designated default is given (single-set deck)", () => {
    const [first] = generateSlides(baseInput);
    expect(first?.image && "defaultSrc" in first.image).toBe(false);
  });

  it("preserves id and hand-written alt for existing slides on regeneration", () => {
    const previous: GeneratedSlide[] = [
      {
        id: "stable-uuid-1",
        content: "/p/480/carousel1.webp", // slug "carousel1" -> matches
        alt: "A hand-written description",
        image: { srcSet: "/p/480/carousel1.webp 480w" },
      },
    ];
    const [first, second] = generateSlides({ ...baseInput, previous });

    expect(first?.id).toBe("stable-uuid-1");
    expect(first?.alt).toBe("A hand-written description");
    expect(second?.id).toBe("id-carousel2"); // new -> freshly minted
    expect(second?.alt).toBe("");
  });

  it("drops slides whose asset no longer exists", () => {
    const previous: GeneratedSlide[] = [
      {
        id: "gone",
        content: "/p/480/carousel9.webp",
        image: { srcSet: "/p/480/carousel9.webp 480w" },
      },
    ];
    const slugs = generateSlides({ ...baseInput, previous }).map((slide) =>
      slugFromUrl(slide.content),
    );
    expect(slugs).toEqual(["carousel1", "carousel2"]);
    expect(slugs).not.toContain("carousel9");
  });
});
