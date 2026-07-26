import { sampleProfileSegment } from "../../../../shared";

/** The engine's canonical profile sampler, aliased so call sites read in the
 * carousel's domain terms (a `CarouselSegment` is a `ProfileSegment`). */
export const sampleCarouselSegment = sampleProfileSegment;
