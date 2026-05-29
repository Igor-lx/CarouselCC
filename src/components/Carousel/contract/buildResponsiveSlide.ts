import type { Slide, SlideImageSource, SlideImageVariants } from "./types";

/**
 * Host-side builder: raw responsive image assets -> a carousel-ready `Slide`.
 *
 * Every app that feeds the carousel images does the same shaping — pick a stable
 * canonical fallback, assemble width-descriptor `srcSet`s, attach art-directed
 * crops, and leave `sizes` to the carousel. This function encodes those
 * invariants once so a host cannot get them subtly wrong (e.g. an unstable
 * `content` that resets the deck on rotation, or a hand-typed `srcSet`). It is a
 * pure data transform with no React and no runtime coupling — exported as a
 * host tool, the same way the Zod schemas are, and never used inside the
 * component. If a host computes slides from changing inputs, it wraps the call
 * in `useMemo`; it is deliberately not a hook.
 *
 * It is agnostic to where assets come from (glob, CDN, CMS), how many there are,
 * the id scheme, and which media a crop uses — all of that is the host's, passed
 * in as data.
 */

/** One resolution candidate: a URL and its intrinsic pixel width (`<width>w`). */
export interface ResponsiveImageCandidate {
  url: string;
  width: number;
}

/**
 * An art-directed variant the browser uses only when `media` matches — e.g. a
 * landscape crop. Mirrors a `<source>`; `sizes` defaults to the carousel's
 * auto value, `type` lets the browser skip an unsupported format.
 */
export interface ResponsiveImageSource {
  media: string;
  candidates: ResponsiveImageCandidate[];
  sizes?: string;
  type?: string;
}

export interface BuildResponsiveSlideInput {
  id: Slide["id"];
  alt?: string;
  /** Resolution candidates for the default image. At least one is required. */
  candidates: ResponsiveImageCandidate[];
  /** Art-directed overrides (e.g. an orientation crop). Optional. */
  sources?: ResponsiveImageSource[];
  /**
   * Canonical identity + `<img>` fallback URL. Defaults to the smallest
   * candidate (the lightest asset). It must be ONE fixed URL per slide across
   * every viewport — that stability is what keeps the viewing position on
   * rotation, since `content` is the only image field in slide identity.
   */
  fallback?: string;
  /** Override the carousel's auto `sizes`. Rarely needed — omit by default. */
  sizes?: string;
}

const byWidthAscending = (
  candidates: readonly ResponsiveImageCandidate[],
): ResponsiveImageCandidate[] =>
  [...candidates].sort((a, b) => a.width - b.width);

/** `[{url:"a",width:480},…]` -> `"a 480w, …"` (width-ascending). */
const toSrcSet = (candidates: readonly ResponsiveImageCandidate[]): string =>
  byWidthAscending(candidates)
    .map((candidate) => `${candidate.url} ${candidate.width}w`)
    .join(", ");

const toImageSource = (source: ResponsiveImageSource): SlideImageSource => ({
  media: source.media,
  srcSet: toSrcSet(source.candidates),
  ...(source.sizes !== undefined && { sizes: source.sizes }),
  ...(source.type !== undefined && { type: source.type }),
});

export function buildResponsiveSlide(input: BuildResponsiveSlideInput): Slide {
  const sorted = byWidthAscending(input.candidates);
  // Smallest candidate is the canonical fallback unless the host overrides it.
  const content = input.fallback ?? sorted[0]?.url ?? "";

  const image: SlideImageVariants = {
    srcSet: toSrcSet(sorted),
    // `sizes` is intentionally omitted unless overridden, so the carousel
    // injects the value derived from its slot count.
    ...(input.sizes !== undefined && { sizes: input.sizes }),
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

/**
 * One resolution's worth of assets across the whole deck: a fixed intrinsic
 * `width` and one URL per slide, index-aligned with the other sets.
 */
export interface ResponsiveImageSet {
  width: number;
  urls: readonly string[];
}

/** An art-directed variant (e.g. an orientation crop) as parallel sets. */
export interface ResponsiveSourceSet {
  media: string;
  sets: readonly ResponsiveImageSet[];
  sizes?: string;
  type?: string;
}

export interface BuildResponsiveSlidesInput {
  /**
   * Default `<img>` candidate sets, one per resolution, index-aligned. The
   * "default" orientation is whatever the app ships here — there is no built-in
   * portrait/landscape assumption; a natively-landscape deck simply puts its
   * landscape sets here and portrait (if any) in `sources`.
   */
  sets: readonly ResponsiveImageSet[];
  /** Art-directed source sets (e.g. the off-orientation crop). */
  sources?: readonly ResponsiveSourceSet[];
  /** Id for slide `index`. Default: `String(index + 1)`. */
  id?: (index: number) => string | number;
  /** Alt text for slide `index`. */
  alt?: (index: number) => string | undefined;
  /** Override the carousel's auto `sizes`. Rarely needed. */
  sizes?: string;
}

const candidatesAt = (
  sets: readonly ResponsiveImageSet[],
  index: number,
): ResponsiveImageCandidate[] =>
  sets.flatMap((set) => {
    const url = set.urls[index];
    return url === undefined ? [] : [{ url, width: set.width }];
  });

/**
 * Batch form of {@link buildResponsiveSlide}: zips parallel per-resolution sets
 * into a `Slide[]`, one slide per index. This is the universal "asset sets ->
 * carousel-ready slides" transform — a host just imports its images, groups
 * them into named sets by resolution/orientation, and calls this once; all the
 * descriptor assembly, canonical-fallback selection, and `sizes` handling live
 * here. Agnostic to image count, orientation, source, and id scheme.
 *
 * Sets are index-aligned (slide `i` is `set.urls[i]` of every set); the slide
 * count is the longest default set, and a missing entry just drops that
 * candidate (so not every slide must carry every variant). Pure: wrap in
 * `useMemo` at the call site if inputs change.
 */
export function buildResponsiveSlides(
  input: BuildResponsiveSlidesInput,
): Slide[] {
  const slideCount = input.sets.reduce(
    (max, set) => Math.max(max, set.urls.length),
    0,
  );
  const idOf = input.id ?? ((index: number) => String(index + 1));

  const slides: Slide[] = [];
  for (let index = 0; index < slideCount; index += 1) {
    const candidates = candidatesAt(input.sets, index);
    if (candidates.length === 0) continue; // no asset for this slide index

    const sources = (input.sources ?? []).flatMap((source) => {
      const sourceCandidates = candidatesAt(source.sets, index);
      return sourceCandidates.length === 0
        ? []
        : [
            {
              media: source.media,
              candidates: sourceCandidates,
              ...(source.sizes !== undefined && { sizes: source.sizes }),
              ...(source.type !== undefined && { type: source.type }),
            },
          ];
    });

    slides.push(
      buildResponsiveSlide({
        id: idOf(index),
        ...(input.alt && { alt: input.alt(index) }),
        candidates,
        ...(sources.length > 0 && { sources }),
        ...(input.sizes !== undefined && { sizes: input.sizes }),
      }),
    );
  }
  return slides;
}
