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
} from "./contract";
export { SLIDE_CLASS_KEYS } from "./contract";
// Host-side pure builders for responsive image slides (types only, no Zod).
export { buildResponsiveSlide, buildResponsiveSlides } from "./contract";
export type {
  BuildResponsiveSlideInput,
  BuildResponsiveSlidesInput,
  ResponsiveImageCandidate,
  ResponsiveImageSource,
  ResponsiveImageSet,
  ResponsiveSourceSet,
} from "./contract";
// Host-side opt-in Zod schemas. Imported separately from
// "@/components/Carousel/contract/schemas" so Zod is not pulled into
// the component's runtime bundle.
