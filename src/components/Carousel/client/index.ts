export { default } from "./Carousel";
export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  Slide,
  SlideImageVariants,
  SlideImageSource,
  ClassNameMap,
  SlideClassMap,
  UserEnvironment,
} from "./public-api";
export { SLIDE_CLASS_KEYS } from "./public-api";
// The Node-only data-gen/ kit and the opt-in Zod schemas are deliberately not
// re-exported here, so the browser entry stays free of node:fs and Zod.
