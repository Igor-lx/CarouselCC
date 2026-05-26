export { default } from "./Carousel";
export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  Slide,
  ClassNameMap,
  SlideClassMap,
} from "./contract";
export { SLIDE_CLASS_KEYS } from "./contract";
// Public Zod schemas for host-side runtime validation of external data.
// The Carousel component itself never imports them.
export { CarouselPropsSchema, CarouselSlidesDataSchema } from "./contract";
