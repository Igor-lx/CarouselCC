import type {
  GeneratedImage,
  GeneratedImageSource,
  GeneratedSlide,
} from "./types";

/**
 * Shapes ONE slide from raw responsive variants — the conventions, in one
 * place: canonical fallback = smallest candidate, `w`-descriptor `srcSet`s,
 * `sizes` left out (the carousel supplies it at render). Pure; no fs, no
 * component imports.
 */

/** One resolution candidate: a URL and its intrinsic pixel width (`<width>w`). */
export interface ImageCandidate {
  url: string;
  width: number;
}

/** An art-directed variant the browser uses only when `media` matches — the
 * emitted `GeneratedImageSource`, with raw `candidates` in place of the
 * assembled `srcSet` string. */
export interface ArtDirectedSource extends Omit<
  GeneratedImageSource,
  "srcSet"
> {
  candidates: ImageCandidate[];
}

export interface BuildSlideInput {
  id: string;
  alt?: string;
  /** Resolution candidates for the default image. At least one required. */
  candidates: ImageCandidate[];
  /** The publisher's designated single-set asset URL — rendered when
   * responsive selection is off. Omit when the deck has just one set. */
  defaultSrc?: string;
  /** Art-directed overrides (e.g. an orientation crop). */
  sources?: ArtDirectedSource[];
  /** Canonical identity + fallback URL. Defaults to the smallest candidate. */
  fallback?: string;
  /** Override the carousel's auto `sizes`. Rarely needed — omit by default. */
  sizes?: string;
}

const byWidthAscending = (
  candidates: readonly ImageCandidate[],
): ImageCandidate[] => [...candidates].sort((a, b) => a.width - b.width);

/** `[{url:"a",width:480},…]` -> `"a 480w, …"` (width-ascending). */
const toSrcSet = (candidates: readonly ImageCandidate[]): string =>
  byWidthAscending(candidates)
    .map((candidate) => `${candidate.url} ${candidate.width}w`)
    .join(", ");

const toImageSource = (source: ArtDirectedSource): GeneratedImageSource => ({
  media: source.media,
  srcSet: toSrcSet(source.candidates),
  ...(source.sizes !== undefined && { sizes: source.sizes }),
  ...(source.type !== undefined && { type: source.type }),
});

export function buildSlide(input: BuildSlideInput): GeneratedSlide {
  const sorted = byWidthAscending(input.candidates);
  // Smallest candidate is the canonical fallback unless the host overrides it.
  const content = input.fallback ?? sorted[0]?.url ?? "";

  const image: GeneratedImage = {
    srcSet: toSrcSet(sorted),
    // `sizes` is intentionally omitted unless overridden, so the carousel
    // injects the value derived from its slot count at render time.
    ...(input.sizes !== undefined && { sizes: input.sizes }),
    ...(input.defaultSrc !== undefined && { defaultSrc: input.defaultSrc }),
    ...(input.sources?.length
      ? { sources: input.sources.map(toImageSource) }
      : {}),
  };

  return {
    id: input.id,
    content,
    ...(input.alt !== undefined && { alt: input.alt }),
    image,
  };
}
