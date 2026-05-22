export { default } from "./Carousel";
export type { CarouselProps, Slide, ClassNameMap, SlideClassMap } from "./types";
export { SLIDE_CLASS_KEYS } from "./types";
// Public Zod schemas for host-side validation of external data — see the
// schema docblocks in `types.ts`. The component does not use them itself.
export { CarouselPropsSchema, CarouselSlidesDataSchema } from "./types";
