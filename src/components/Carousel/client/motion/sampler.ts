import { sampleProfileSegment } from "../../../../shared";

/**
 * The carousel's segment reader IS the engine's canonical profile sampler —
 * a `CarouselSegment` is a `ProfileSegment` with the carousel's strategy
 * vocabulary. Kept as a named alias so call sites read in domain terms.
 */
export const sampleCarouselSegment = sampleProfileSegment;
