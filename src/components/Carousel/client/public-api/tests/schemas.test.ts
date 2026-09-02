import { describe, expect, it } from "vitest";
import { createElement } from "react";

import {
  CarouselSlidesDataSchema,
  SlideImageSourceSchema,
  SlideImageVariantsSchema,
  SlideSchema,
} from "../schemas";

/**
 * The host's only supported way to validate external slide data, and the
 * source the `Slide` family of types is inferred from. Loosen it and the types
 * loosen with it silently; tighten it and a document that used to load stops
 * loading, in the host's app rather than here.
 */

const IMAGE_SLIDE = {
  id: "s1",
  content: "https://example.test/a.webp",
  alt: "a photo",
  image: {
    srcSet: "https://example.test/a-480.webp 480w",
    sizes: "50vw",
    defaultSrc: "https://example.test/a-720.webp",
    sources: [
      {
        media: "(orientation: portrait)",
        srcSet: "https://example.test/tall.webp 480w",
      },
    ],
  },
};

describe("SlideSchema — what a slide may be", () => {
  it("accepts the shape the generator emits", () => {
    expect(SlideSchema.safeParse(IMAGE_SLIDE).success).toBe(true);
  });

  it("accepts the bare minimum: an id and some content", () => {
    expect(SlideSchema.safeParse({ id: 1, content: "hello" }).success).toBe(
      true,
    );
  });

  it("takes an id as either a string or a number, and nothing else", () => {
    expect(SlideSchema.safeParse({ id: 1, content: "x" }).success).toBe(true);
    expect(SlideSchema.safeParse({ id: "a", content: "x" }).success).toBe(true);
    expect(SlideSchema.safeParse({ id: null, content: "x" }).success).toBe(
      false,
    );
    expect(SlideSchema.safeParse({ content: "x" }).success).toBe(false);
  });

  it("accepts a React element as content — a slide need not be a picture", () => {
    const element = createElement("div", null, "custom");
    expect(SlideSchema.safeParse({ id: "e", content: element }).success).toBe(
      true,
    );
  });

  it("rejects content that is empty or only whitespace", () => {
    // An empty string would render as a slide with no picture and no text.
    expect(SlideSchema.safeParse({ id: "e", content: "" }).success).toBe(false);
    expect(SlideSchema.safeParse({ id: "e", content: "   " }).success).toBe(
      false,
    );
  });

  it("rejects content that is neither text, number nor element", () => {
    for (const content of [null, undefined, {}, [], true]) {
      expect(SlideSchema.safeParse({ id: "e", content }).success).toBe(false);
    }
  });

  it("requires a source to carry both its media and its srcSet", () => {
    const withSource = (source: unknown) => ({
      ...IMAGE_SLIDE,
      image: { sources: [source] },
    });
    expect(
      SlideSchema.safeParse(withSource({ media: "(x)", srcSet: "a 1w" }))
        .success,
    ).toBe(true);
    expect(SlideSchema.safeParse(withSource({ srcSet: "a 1w" })).success).toBe(
      false,
    );
    expect(SlideSchema.safeParse(withSource({ media: "(x)" })).success).toBe(
      false,
    );
    expect(
      SlideSchema.safeParse(withSource({ media: "", srcSet: "a 1w" })).success,
    ).toBe(false);
  });

  it("keeps every image field optional — a text slide carries none of them", () => {
    expect(SlideSchema.safeParse({ id: "t", content: "words" }).success).toBe(
      true,
    );
    expect(SlideSchema.safeParse({ ...IMAGE_SLIDE, image: {} }).success).toBe(
      true,
    );
  });
});

describe("CarouselSlidesDataSchema — the document", () => {
  it("accepts a well-formed deck and hands back the parsed value", () => {
    const result = CarouselSlidesDataSchema.safeParse([
      IMAGE_SLIDE,
      IMAGE_SLIDE,
    ]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(2);
  });

  it("accepts an empty deck — the component renders nothing for it", () => {
    expect(CarouselSlidesDataSchema.safeParse([]).success).toBe(true);
  });

  it("rejects the whole document when a single slide is malformed", () => {
    expect(
      CarouselSlidesDataSchema.safeParse([IMAGE_SLIDE, { id: "bad" }]).success,
    ).toBe(false);
  });

  it("rejects a document that is not an array at all", () => {
    expect(CarouselSlidesDataSchema.safeParse(IMAGE_SLIDE).success).toBe(false);
    expect(CarouselSlidesDataSchema.safeParse(null).success).toBe(false);
  });
});

describe("the image fields reject blanks as firmly as content does", () => {
  // Every one of these ends up in an attribute the browser parses. An empty
  // `srcSet` or `media` is not a smaller picture — it is a `<source>` that
  // matches nothing, so the whole `<picture>` silently falls through to the
  // fallback, or nothing renders at all. Whitespace is the case a length check
  // alone lets past.
  const blanks = ["", "   ", "\t\n"];

  it("refuses a blank media or srcSet on a source", () => {
    for (const blank of blanks) {
      expect(
        SlideImageSourceSchema.safeParse({
          media: blank,
          srcSet: "a.webp 1x",
        }).success,
      ).toBe(false);
      expect(
        SlideImageSourceSchema.safeParse({
          media: "(min-width: 1px)",
          srcSet: blank,
        }).success,
      ).toBe(false);
    }
  });

  it("refuses a blank sizes or type when the host does supply one", () => {
    // Optional means "may be absent", not "may be empty".
    for (const blank of blanks) {
      for (const field of ["sizes", "type"] as const) {
        expect(
          SlideImageSourceSchema.safeParse({
            media: "(min-width: 1px)",
            srcSet: "a.webp 1x",
            [field]: blank,
          }).success,
        ).toBe(false);
      }
    }
  });

  it("refuses a blank srcSet, sizes or defaultSrc on the variants", () => {
    for (const blank of blanks) {
      for (const field of ["srcSet", "sizes", "defaultSrc"] as const) {
        expect(
          SlideImageVariantsSchema.safeParse({ [field]: blank }).success,
        ).toBe(false);
      }
    }
  });

  it("keeps a value the host padded, rather than rejecting it", () => {
    // Trimming decides ACCEPTANCE; it must not silently rewrite what the host
    // sent, or a `sizes` string would come back subtly different.
    const parsed = SlideImageSourceSchema.safeParse({
      media: " (min-width: 1px) ",
      srcSet: " a.webp 1x ",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("a React element is recognised under either of its sigils", () => {
  it("accepts the legacy element symbol as well as the transitional one", () => {
    // React 19 emits `react.transitional.element`; anything compiled against
    // an older runtime — a host's own component library — still emits
    // `react.element`. Recognising only one rejects half the ecosystem.
    for (const sigil of ["react.element", "react.transitional.element"]) {
      const element = { $$typeof: Symbol.for(sigil), type: "div", props: {} };
      expect(SlideSchema.safeParse({ id: "s", content: element }).success).toBe(
        true,
      );
    }
  });

  it("still refuses a plain object pretending to be one", () => {
    expect(
      SlideSchema.safeParse({ id: "s", content: { type: "div" } }).success,
    ).toBe(false);
  });
});
