import type { CarouselSlideMediaView } from "../../context";

/**
 * Pure helpers of the warm manager.
 *
 * `resolveWarmPages` — which pages around the target to warm: `pagesNr` on
 * each side, cyclic decks wrap, finite decks clamp; the target page itself is
 * excluded (its images are already loading eagerly).
 *
 * `resolveRenderedSrcSet` — the candidate set the RENDERED `<picture>` would
 * choose for the current viewport, which is the only set worth warming. A
 * detached `Image` understands `srcset`/`sizes` (resolution switching) but NOT
 * `<source media>` (art direction), so the media choice has to be made here:
 * the art-directed `<source>` when the viewport matches its condition, the
 * default set otherwise. (One art-direction axis exists by contract —
 * `orientationMediaSync.test.ts` pins generated sources to the canonical
 * axis strings; which crop family sits on which side is the dataset's
 * business.) Warming `slide.srcSet` blindly would
 * fetch the default set while the deck renders the art-directed crop:
 * bytes spent on an asset that never appears, and the needed crop left cold.
 *
 * There is deliberately no parallel-orientation ("rotation") warm. The set of
 * slides the OTHER orientation would show depends on the host's own responsive
 * policy (`visibleSlidesNr` arrives already resolved for the CURRENT viewport),
 * so it is not knowable here — and it cost a full extra crop per slide for a
 * rotation most users never perform. The rotation veil already guarantees a
 * correct swap.
 */
export interface RenderedSrcSet {
  srcSet?: string;
  sizes?: string;
}

export const resolveRenderedSrcSet = (
  slide: CarouselSlideMediaView,
  matchesMedia: (media: string) => boolean,
): RenderedSrcSet => {
  // FIRST matching source in document order — exactly the browser's own
  // <picture> selection rule, so the warm can never disagree with render.
  const artDirected = slide.sources?.find(
    (source) => source.media !== undefined && matchesMedia(source.media),
  );
  return artDirected
    ? { srcSet: artDirected.srcSet, sizes: artDirected.sizes }
    : { srcSet: slide.srcSet, sizes: slide.sizes };
};
export const resolveWarmPages = (
  targetPageIndex: number,
  pageCount: number,
  pagesNr: number,
  isFinite: boolean,
): number[] => {
  if (!(pageCount > 1) || !(pagesNr > 0)) return [];
  const pages = new Set<number>();
  for (let offset = 1; offset <= pagesNr; offset += 1) {
    for (const direction of [1, -1]) {
      const raw = targetPageIndex + offset * direction;
      if (isFinite) {
        if (raw >= 0 && raw < pageCount) pages.add(raw);
      } else {
        pages.add(((raw % pageCount) + pageCount) % pageCount);
      }
    }
  }
  pages.delete(targetPageIndex);
  return [...pages];
};
