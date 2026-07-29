import { buildSlide, type ImageCandidate } from "./buildSlide";
import type { GeneratedSlide } from "./types";

/**
 * Pure core: turns per-resolution asset maps into the `GeneratedSlide[]`
 * document, with an **idempotent merge** against the previous document. A slide
 * is identified by its stable slug (the asset filename), so regeneration
 * preserves the existing `id` and the hand-written `alt`, mints ids only for new
 * assets, and drops removed ones. No fs, no component imports — unit-testable.
 */

/** One resolution's URLs across the deck, keyed by stable slug (filename). */
export interface GenVariantWidth {
  width: number;
  urlBySlug: Record<string, string>;
}

/** An art-directed source group (e.g. a landscape crop) as parallel widths. */
export interface GenSourceGroup {
  media: string;
  type?: string;
  widths: GenVariantWidth[];
}

export interface GenerateSlidesInput {
  /** Default `<img>` resolution variants. */
  widths: GenVariantWidth[];
  /** The publisher's designated single-set asset, as a `slug -> URL` map
   * (one resolution of one set). Omit for a single-set deck. */
  defaultUrlBySlug?: Record<string, string>;
  /** Art-directed source groups. */
  sources?: GenSourceGroup[];
  /** Stable slide order (slugs), e.g. sorted by slide number. */
  slugs: string[];
  /** Previous document, for id/alt preservation. */
  previous?: readonly GeneratedSlide[] | undefined;
  /** Mints an id for a genuinely new slide. Defaults to the slug itself. */
  newId?: ((slug: string) => string) | undefined;
}

/** `".../carousel7.webp"` (or a bare filename) -> `"carousel7"`. */
export const slugFromUrl = (url: string): string =>
  url.slice(url.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

interface PreservedFields {
  id: string;
  alt?: string | undefined;
}

const candidatesAt = (
  widths: GenVariantWidth[],
  slug: string,
): ImageCandidate[] =>
  widths.flatMap((variant) => {
    const url = variant.urlBySlug[slug];
    return url === undefined ? [] : [{ url, width: variant.width }];
  });

export function generateSlides(input: GenerateSlidesInput): GeneratedSlide[] {
  // Index the previous document by slug so existing id/alt survive regeneration.
  const preservedBySlug = new Map<string, PreservedFields>();
  for (const slide of input.previous ?? []) {
    preservedBySlug.set(slugFromUrl(slide.content), {
      id: slide.id,
      alt: slide.alt,
    });
  }

  const mintId = input.newId ?? ((slug: string) => slug);
  const slides: GeneratedSlide[] = [];

  for (const slug of input.slugs) {
    const candidates = candidatesAt(input.widths, slug);
    if (candidates.length === 0) continue; // no asset for this slug

    const sources = (input.sources ?? []).flatMap((group) => {
      const groupCandidates = candidatesAt(group.widths, slug);
      return groupCandidates.length === 0
        ? []
        : [
            {
              media: group.media,
              candidates: groupCandidates,
              ...(group.type !== undefined && { type: group.type }),
            },
          ];
    });

    const defaultSrc = input.defaultUrlBySlug?.[slug];
    const preserved = preservedBySlug.get(slug);
    slides.push(
      buildSlide({
        id: preserved?.id ?? mintId(slug),
        alt: preserved?.alt ?? "", // scaffold; fill by hand, preserved on regen
        candidates,
        ...(defaultSrc !== undefined && { defaultSrc }),
        ...(sources.length > 0 && { sources }),
      }),
    );
  }

  return slides;
}
