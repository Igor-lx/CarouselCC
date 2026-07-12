import type { CarouselSlideMediaView } from "../../context";

/**
 * Pure helpers of the preload module.
 *
 * `resolveWarmPages` — which pages around the target to warm: `pagesNr` on
 * each side, cyclic decks wrap, finite decks clamp; the target page itself is
 * excluded (its images are already loading eagerly).
 *
 * `resolveParallelCandidate` — the ONLY heuristic in the module: the parallel
 * orientation's `<source>` cannot be preloaded natively (its `media` never
 * matches the current viewport), so a candidate is picked manually — the
 * smallest one that covers `targetPx` (slot × DPR approximation), else the
 * largest available. A one-step miss is acceptable: the warm is a cache hint,
 * and the rotation veil masks a slow swap anyway.
 */

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

interface SrcSetCandidate {
  url: string;
  width: number;
}

const parseSrcSet = (srcSet: string): SrcSetCandidate[] => {
  const out: SrcSetCandidate[] = [];
  for (const entry of srcSet.split(",")) {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    if (!url) continue;
    const match = parts[1]?.match(/^(\d+(?:\.\d+)?)w$/);
    out.push({ url, width: match ? Number(match[1]) : 0 });
  }
  return out;
};

export const resolveParallelCandidate = (
  srcSet: string | undefined,
  targetPx: number,
): string | null => {
  if (!srcSet) return null;
  const candidates = parseSrcSet(srcSet).sort((a, b) => a.width - b.width);
  if (candidates.length === 0) return null;
  const covering = candidates.find((candidate) => candidate.width >= targetPx);
  return (covering ?? candidates[candidates.length - 1]!).url;
};

/**
 * The parallel set of one slide: when the viewport is portrait the parallel
 * set is the DEFAULT `srcSet` (the landscape asset); otherwise it is the
 * `<source>` whose media equals the portrait condition.
 */
export const resolveParallelSrcSet = (
  slide: CarouselSlideMediaView,
  isPortrait: boolean,
  portraitMediaCondition: string,
): string | undefined => {
  if (isPortrait) return slide.srcSet;
  return slide.sources?.find((source) => source.media === portraitMediaCondition)
    ?.srcSet;
};
