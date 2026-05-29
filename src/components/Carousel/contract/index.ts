export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  UserEnvironment,
  Slide,
  SlideImageVariants,
  SlideImageSource,
  ClassNameMap,
  ClassNameKey,
  SlideClassMap,
  SlideClassKey,
} from "./types";
export { CLASS_NAME_KEYS, SLIDE_CLASS_KEYS } from "./classKeys";
// Host-side pure builder: raw responsive assets -> a carousel-ready Slide.
// Runtime-safe (types only, no Zod), so it ships in the public entry point.
export { buildResponsiveSlide, buildResponsiveSlides } from "./buildResponsiveSlide";
export type {
  BuildResponsiveSlideInput,
  BuildResponsiveSlidesInput,
  ResponsiveImageCandidate,
  ResponsiveImageSource,
  ResponsiveImageSet,
  ResponsiveSourceSet,
} from "./buildResponsiveSlide";
// Host-side opt-in Zod schemas. Re-exported here so the public contract
// has one entry point; hosts that want validation can also import
// `@/components/Carousel/contract/schemas` directly.
export { CarouselPropsSchema, CarouselSlidesDataSchema } from "./schemas";
